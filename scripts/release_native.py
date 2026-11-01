"""Recheck native provenance for the current build, independently of historical kits."""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
from pathlib import Path
import tarfile
import tomllib
import zipfile

from scripts import native_redistribution as upstream
from scripts.windows_crt import PROVENANCE, ROOT, require, sha, verify_payload


def audit(sidecar: Path, sources: Path, notices: Path, final: bool = False) -> dict:
    from PyInstaller.archive.readers import CArchiveReader

    notices.mkdir(parents=True, exist_ok=True)
    tauri = ROOT / "apps/desktop/src-tauri/target/release/pdf-studio-local.exe"
    crt = verify_payload(sidecar, extra=[tauri] if final else [])
    health = json.loads(
        PROVENANCE.with_name("health-runtime-crt.json").read_text("utf-8")
    )
    require(
        health["health"] == "PASS" and health["sidecarSha256"] == crt["sidecarSha256"],
        "Stale sidecar startup/runtime CRT evidence",
    )
    require(
        {entry["filename"]: entry["sha256"] for entry in health["runtimeCrt"]}
        == {entry["filename"]: entry["sha256"] for entry in crt["files"]},
        "Loaded CRT differs from the packaged CRT",
    )
    frozen = CArchiveReader(str(sidecar))
    lock = tomllib.loads((ROOT / "services/pdf-engine/uv.lock").read_text("utf-8"))
    package = next(p for p in lock["package"] if p["name"] == "pymupdf")
    require(
        package["version"] == "1.26.3",
        "MuPDF provenance review must be updated for a changed package version",
    )
    wheel = next(w for w in package["wheels"] if w["url"].endswith("win_amd64.whl"))
    wheel_path = sources / wheel["url"].rsplit("/", 1)[-1]
    upstream.download(wheel_path, wheel["url"], wheel["hash"].split(":")[1])
    chain = []
    with zipfile.ZipFile(wheel_path) as wheel_zip:
        record = {
            row[0].replace("\\", "/"): row
            for row in csv.reader(
                io.StringIO(wheel_zip.read("pymupdf-1.26.3.dist-info/RECORD").decode())
            )
        }
        for path in ["mupdfcpp64.dll", "pymupdf\\_mupdf.pyd", "pymupdf\\_extra.pyd"]:
            name = "pymupdf/" + path.replace("\\", "/").rsplit("/", 1)[-1]
            data = wheel_zip.read(name)
            require(
                data == frozen.extract(path),
                f"Frozen MuPDF differs from locked wheel: {path}",
            )
            require(
                record[name][1]
                == "sha256="
                + base64.urlsafe_b64encode(bytes.fromhex(sha(data)))
                .decode()
                .rstrip("="),
                "Wheel RECORD mismatch",
            )
            chain.append({"path": path, "bytes": len(data), "sha256": sha(data)})
        require(
            wheel_zip.read("pymupdf/_build.py").decode().strip()
            == "mupdf_location='https://mupdf.com/downloads/archive/mupdf-1.26.3-source.tar.gz'",
            "Wheel source provenance changed",
        )
        material = io.BytesIO()
        with zipfile.ZipFile(material, "w") as archive:
            for directory in [notices, ROOT / "services/pdf-engine/build/ocr/notices"]:
                for path in directory.rglob("*"):
                    if path.is_file():
                        archive.writestr(str(path), path.read_bytes())
        material.seek(0)
        with (
            tarfile.open(sources / "mupdf-1.26.3-source.tar.gz") as tar,
            zipfile.ZipFile(material) as notice_zip,
        ):
            graph = upstream.static_graph(tar, notice_zip)
            members = {
                m.name.split("/", 1)[1]: m
                for m in tar.getmembers()
                if m.isfile() and "/" in m.name
            }
            matched = 0
            for name in wheel_zip.namelist():
                prefix = "pymupdf/mupdf-devel/"
                relative = name.removeprefix(prefix)
                if (
                    name.startswith(prefix + "include/mupdf/")
                    and relative in members
                    and name.endswith(".h")
                ):
                    source_data = tar.extractfile(members[relative]).read()
                    data = wheel_zip.read(name)
                    if relative == "include/mupdf/fitz/config.h":
                        require(
                            data.replace(b"\r\n", b"\n")
                            == b"#define TOFU_CJK_EXT 1 /* PyMuPDF override. */\n"
                            + source_data,
                            "Unexpected MuPDF config patch",
                        )
                    else:
                        require(data == source_data, "MuPDF header differs from source")
                    matched += 1
            require(
                matched == 82
                and all(c["status"] == "OK" for c in graph["components"].values()),
                "MuPDF source/notice coverage incomplete",
            )
    sdk = sources / "microsoft.web.webview2.1.0.3650.58.nupkg"
    upstream.download(sdk, upstream.SDK_URL, upstream.SDK_SHA)
    crates = json.loads((sources / "local-build-inputs.json").read_text("utf-8"))
    # The normal graph's .d evidence is intentionally incomplete before a first Rust build.
    import subprocess

    metadata = json.loads(
        subprocess.check_output(
            [
                "cargo",
                "metadata",
                "--locked",
                "--format-version=1",
                "--filter-platform=x86_64-pc-windows-msvc",
                "--manifest-path",
                str(ROOT / "apps/desktop/src-tauri/Cargo.toml"),
            ],
            cwd=ROOT,
        )
    )
    crate = Path(
        next(
            p["manifest_path"]
            for p in metadata["packages"]
            if p["name"] == "webview2-com-sys" and p["version"] == "0.38.2"
        )
    ).parent
    with zipfile.ZipFile(sdk) as archive:
        loader = archive.read("build/native/x64/WebView2LoaderStatic.lib")
        require(
            (crate / "x64/WebView2LoaderStatic.lib").read_bytes() == loader,
            "SDK static loader differs",
        )
        sdk_notices = notices / "microsoft/WebView2-SDK-1.0.3650.58"
        sdk_notices.mkdir(parents=True, exist_ok=True)
        for name in ["LICENSE.txt", "NOTICE.txt"]:
            (sdk_notices / name).write_bytes(archive.read(name))
    if final:
        compiled = list(
            (ROOT / "apps/desktop/src-tauri/target/release/build").glob(
                "webview2-com-sys-*/out/x64/WebView2LoaderStatic.lib"
            )
        )
        require(
            str(crate) in crates
            and bool(compiled)
            and all(path.read_bytes() == loader for path in compiled),
            "Missing/current Rust loader compilation evidence",
        )
    crt_notices = notices / "microsoft/CRT"
    crt_notices.mkdir(parents=True, exist_ok=True)
    installation = Path(crt["environment"]["installationPath"])
    redist_lists = list((installation / "Licenses").glob("*/Redist.txt"))
    require(bool(redist_lists), "Installed Microsoft REDIST reference missing")
    (crt_notices / "REDIST.txt").write_bytes(redist_lists[0].read_bytes())
    for name, (url, expected) in upstream.TERMS.items():
        upstream.download(crt_notices / name, url, expected)
    (crt_notices / "PROVENANCE.json").write_bytes(PROVENANCE.read_bytes())
    (crt_notices / "MECHANISM.md").write_text(
        "# Microsoft CRT app-local\n\nUnmodified x64 files from the discovered Build Tools VC/Redist/MSVC release CRT directory.\nThe project uses the Microsoft documented app-local redistribution mechanism, subject to its applicable terms. This is technical provenance verification, not legal certification.\n\n"
        + "\n".join(crt["environment"]["terms"]),
        "utf-8",
    )
    result = {
        "sidecarSha256": sha(sidecar.read_bytes()),
        "crt": crt,
        "runtimeHealth": {
            "health": "PASS",
            "sidecarSha256": health["sidecarSha256"],
            "crtHashes": {
                entry["filename"]: entry["sha256"] for entry in health["runtimeCrt"]
            },
        },
        "mupdf": {
            "status": "OK",
            "version": "1.26.3",
            "chain": chain,
            "matchedHeaders": matched,
            "staticBuild": graph,
        },
        "webview2": {
            "status": "OK",
            "version": "1.0.3650.58",
            "loaderSha256": sha(loader),
            "license": "Microsoft BSD-3-Clause SDK LICENSE.txt + NOTICE.txt",
            "runtime": "Evergreen not bundled; downloadBootstrapper",
        },
        "finalCompilationChecked": final,
    }
    (notices / "native-evidence.json").write_text(json.dumps(result, indent=2), "utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--sidecar", type=Path, required=True)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--notices", type=Path, required=True)
    parser.add_argument("--final", action="store_true")
    args = parser.parse_args()
    audit(args.sidecar, args.sources, args.notices, args.final)
    print(
        "PASS native provenance: official CRT, MuPDF sources/notices, Microsoft WebView2 loader"
    )

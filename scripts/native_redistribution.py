"""Inspect the unchanged MVP-002 Windows candidate; never rebuild or clear CRT rights.

Run with the existing PyInstaller tool environment. Only ignored release evidence
is written. The original source archive, installer and installed files stay intact.
"""

from __future__ import annotations

import ast
import argparse
import base64
import csv
import datetime as dt
import hashlib
import io
import json
import posixpath
import re
import subprocess
import tarfile
import tomllib
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/output/mvp-002"
OUT = ROOT / "data/output/mvp-003"
BUILD_COMMIT = "8fe3d4f6af049354b539ff62fbf1b3c3dd630b0e"
NSIS_SHA = "975800cc45325b22ae213d8763997862a5990c57eb5f3a90d502e7e1d1126eef"
SOURCE_SHA = "0c9336723d9d9ebcb661913bf4fc2c290e355ab66d6e4c8bf4819fbc88488a73"
SDK_URL = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3650.58/microsoft.web.webview2.1.0.3650.58.nupkg"
SDK_SHA = "911a472128c82ac8baa0c486c23342cc9dd6e7dc50d754e676726642ca065c60"
LICENSES = {
    "brotli": ("compression", "MIT"),
    "extract": ("layout extraction", "AGPL-3.0-or-later"),
    "freetype": ("font rendering", "FTL (chosen alternative)"),
    "gumbo-parser": ("HTML parsing", "Apache-2.0"),
    "harfbuzz": ("text shaping", "Old MIT + per-file notices"),
    "jbig2dec": ("JBIG2 decoding", "AGPL-3.0-or-later + LICENSE"),
    "lcms2": ("colour management", "MIT"),
    "leptonica": ("OCR image processing", "BSD-2-Clause"),
    "libjpeg": ("JPEG codec", "IJG"),
    "mujs": ("PDF JavaScript", "ISC"),
    "openjpeg": ("JPEG2000 codec", "BSD-2-Clause"),
    "tesseract": ("OCR", "Apache-2.0"),
    "zint": (
        "barcode generation, backend library",
        "BSD-3-Clause; see LICENSE distinction from GPL CLI",
    ),
    "zlib": ("compression", "Zlib"),
    "zxing-cpp": ("barcode decoding", "Apache-2.0"),
}
TERMS = {
    "buildtools-2022.docx": (
        "https://visualstudio.microsoft.com/wp-content/uploads/2024/03/Visual-Studio-2022-Diagnostic-Build-Tools-Agent-License_Update-March-2024_EN.docx",
        "2f66b86a00e8d9833789897ce23d05a4a2dbea370cf39c8c1098dbc17d0e7bdc",
    ),
    "crt-2022.docx": (
        "https://visualstudio.microsoft.com/wp-content/uploads/2021/09/Visual-C-Runtime-2015-2022-License-1.docx",
        "f1e3d56ceb2ad68aae0711b910375009e651ac5530fa0760f0dea6e81e54fae1",
    ),
}
METADATA_PATHS = {
    "scripts/native_redistribution.py",
    "scripts/redistribution.py",
    "scripts/run-mvp-qa.py",
    "services/pdf-engine/tests/test_redistribution.py",
    "MVP_STATUS.md",
    "THIRD_PARTY_NOTICES.md",
    "WINDOWS_PREVIEW.md",
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path) -> dict:
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha(path.read_bytes()),
    }


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), "utf-8")


def git(*arguments: str) -> str:
    return subprocess.check_output(["git", *arguments], cwd=ROOT, text=True).strip()


def metadata_only() -> bool:
    changed = set(git("diff", "--name-only", BUILD_COMMIT, "HEAD").splitlines())
    return not git("diff", "HEAD", "--name-only") and changed <= METADATA_PATHS


def download(path: Path, url: str, expected: str) -> None:
    if not path.exists():
        path.write_bytes(urllib.request.urlopen(url, timeout=120).read())
    if sha(path.read_bytes()) != expected:
        raise ValueError(f"Upstream hash mismatch: {path.name}")


def active(condition: str | None) -> bool:
    """Evaluate the Release x64 conditions used by these pinned projects."""
    if not condition:
        return True
    value = condition.replace("$(Configuration)", "Release").replace(
        "$(Platform)", "x64"
    )
    match = re.fullmatch(r"\s*'([^']*)'\s*==\s*'([^']*)'\s*", value)
    if not match:
        raise ValueError(f"Unrecognised project condition: {condition}")
    return match[1] == match[2]


def static_graph(archive: tarfile.TarFile, notices: zipfile.ZipFile) -> dict:
    members = {
        m.name.split("/", 1)[1]: m
        for m in archive.getmembers()
        if m.isfile() and "/" in m.name
    }
    ns = {"m": "http://schemas.microsoft.com/developer/msbuild/2003"}
    pending = ["mupdfcpp.vcxproj"]
    projects: dict = {}
    components: dict = {}
    notice_hashes = {
        sha(notices.read(n)) for n in notices.namelist() if not n.endswith("/")
    }
    while pending:
        name = pending.pop()
        if name in projects:
            continue
        path = "platform/win32/" + name
        data = archive.extractfile(members[path]).read()
        tree = ET.fromstring(data)
        refs = [
            n.get("Include")
            for n in tree.findall(".//m:ProjectReference", ns)
            if n.get("Include")
        ]
        pending.extend(refs)
        sources = []
        for group in tree.findall("m:ItemGroup", ns):
            if not active(group.get("Condition")):
                continue
            for node in group.findall("m:ClCompile", ns):
                if not node.get("Include") or not active(node.get("Condition")):
                    continue
                if any(
                    n.text == "true" and active(n.get("Condition"))
                    for n in node.findall("m:ExcludedFromBuild", ns)
                ):
                    continue
                src = posixpath.normpath(
                    "platform/win32/" + node.get("Include").replace("\\", "/")
                )
                sources.append(src)
                if src.startswith("thirdparty/"):
                    component = src.split("/")[1]
                    item = components.setdefault(
                        component, {"projects": set(), "sources": set()}
                    )
                    item["projects"].add(name)
                    item["sources"].add(src)
        release_settings = {}
        for group in tree.findall("m:ItemDefinitionGroup", ns):
            if active(group.get("Condition")):
                for key in [
                    "PreprocessorDefinitions",
                    "RuntimeLibrary",
                    "AdditionalDependencies",
                ]:
                    release_settings[key] = [
                        n.text for n in group.findall(f".//m:{key}", ns)
                    ]
        projects[name] = {
            "sha256": sha(data),
            "references": refs,
            "compileInputs": sources,
            "distribution": "build-only tool"
            if name == "bin2coff.vcxproj"
            else "linked project input",
            "releaseSettings": release_settings,
        }
    for name, item in components.items():
        item["projects"] = sorted(item["projects"])
        item["sources"] = sorted(item["sources"])
        if any(src not in members for src in item["sources"]):
            raise ValueError(f"Missing active source input: {name}")
        item["sourceFingerprint"] = sha(
            "".join(
                src + ":" + sha(archive.extractfile(members[src]).read()) + "\n"
                for src in item["sources"]
            ).encode()
        )
        candidates = [
            p
            for p in members
            if p.startswith(f"thirdparty/{name}/")
            and (
                re.search(
                    r"(?i)(licen[cs]e|copying|copyright|notice)", posixpath.basename(p)
                )
                or posixpath.basename(p).upper() in {"FTL.TXT", "README"}
            )
        ]
        item["noticesInMvp002"] = [
            p
            for p in candidates
            if sha(archive.extractfile(members[p]).read()) in notice_hashes
        ]
        item["role"], item["license"] = LICENSES[name]
        item["sourceVersion"] = (
            "vendored in SHA-pinned MuPDF 1.26.3; sourceFingerprint identifies exact compiled source subset"
        )
        item["status"] = "OK" if item["noticesInMvp002"] else "NEEDS_REVIEW"
    return {
        "configuration": "Release|x64",
        "coverage": "conservative linked project inputs; not individual retained linker symbols",
        "projects": projects,
        "components": components,
    }


def inspect() -> dict:
    from PyInstaller.archive.readers import CArchiveReader
    import pefile
    import pymupdf

    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((BASE / "RELEASE_MANIFEST.json").read_text("utf-8"))
    require(manifest["commit"] == BUILD_COMMIT, "Native provenance check failed")
    for entry in manifest["artifacts"]:
        require(
            file_record(BASE / entry["file"]) == entry, "Native provenance check failed"
        )
    installer = next(BASE.glob("*_x64-setup.exe"))
    require(sha(installer.read_bytes()) == NSIS_SHA, "Native provenance check failed")
    source_zip = next(BASE.glob(f"*{BUILD_COMMIT[:12]}_sources.zip"))
    require(
        sha(source_zip.read_bytes()) == SOURCE_SHA, "Native provenance check failed"
    )
    installed = next((ROOT / "data/output/mvp-001").glob("installation * QA"))
    native = json.loads((BASE / "native-mvp.json").read_text("utf-8"))
    require(
        sha((installed / "pdf-engine.exe").read_bytes()) == native["sidecarSha256"],
        "Native provenance check failed",
    )
    require(
        sha((installed / "pdf-studio-local.exe").read_bytes()) == native["sha256"],
        "Native provenance check failed",
    )
    frozen = CArchiveReader(str(installed / "pdf-engine.exe"))
    package = next(
        p
        for p in tomllib.loads(
            (ROOT / "services/pdf-engine/uv.lock").read_text("utf-8")
        )["package"]
        if p["name"] == "pymupdf"
    )
    wheel = next(w for w in package["wheels"] if w["url"].endswith("win_amd64.whl"))
    wheel_path = OUT / wheel["url"].rsplit("/", 1)[-1]
    download(wheel_path, wheel["url"], wheel["hash"].split(":")[1])
    binaries = []
    for name in frozen.toc:
        if name.lower().endswith((".dll", ".pyd")):
            data = frozen.extract(name)
            pe = pefile.PE(data=data)
            version_strings = {}
            for group in getattr(pe, "FileInfo", []):
                for item in group:
                    for table in getattr(item, "StringTable", []):
                        version_strings.update(
                            {
                                key.decode(): value.decode("utf-8", "replace")
                                for key, value in table.entries.items()
                            }
                        )
            binaries.append(
                {
                    "name": name,
                    "bytes": len(data),
                    "sha256": sha(data),
                    "peTimestamp": pe.FILE_HEADER.TimeDateStamp,
                    "peTimestampUtc": dt.datetime.fromtimestamp(
                        pe.FILE_HEADER.TimeDateStamp, dt.timezone.utc
                    ).isoformat(),
                    "fileVersion": version_strings.get("FileVersion"),
                    "imports": [
                        entry.dll.decode()
                        for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])
                    ],
                }
            )
    for name in ["pdf-engine.exe", "pdf-studio-local.exe"]:
        data = (installed / name).read_bytes()
        pe = pefile.PE(data=data)
        binaries.append(
            {
                "name": name,
                "bytes": len(data),
                "sha256": sha(data),
                "imports": [
                    entry.dll.decode()
                    for entry in getattr(pe, "DIRECTORY_ENTRY_IMPORT", [])
                ],
            }
        )
    bundled_names = {
        entry["name"].replace("\\", "/").rsplit("/", 1)[-1].lower()
        for entry in binaries
    }
    for entry in binaries:
        entry["dependencyOrigins"] = {
            name: "bundled in sidecar/package"
            if name.lower() in bundled_names
            else "Windows OS/API-set; not bundled"
            for name in entry["imports"]
        }
    with (
        zipfile.ZipFile(wheel_path) as wheel_zip,
        zipfile.ZipFile(source_zip) as sources,
        zipfile.ZipFile(BASE / "THIRD_PARTY_NOTICES.zip") as notices,
    ):
        require(
            sources.read("SOURCE_COMMIT.txt").decode().strip() == BUILD_COMMIT,
            "Native provenance check failed",
        )
        for name, record in manifest["evidence"]["buildProvenance"]["sources"].items():
            require(
                sha(sources.read("third-party/" + name)) == record["sha256"],
                "Native provenance check failed",
            )
        source_data = sources.read("third-party/mupdf-1.26.3-source.tar.gz")
        with tarfile.open(fileobj=io.BytesIO(source_data)) as mupdf:
            graph = static_graph(mupdf, notices)
            headers = []
            members = {
                m.name.split("/", 1)[1]: m
                for m in mupdf.getmembers()
                if m.isfile() and "/" in m.name
            }
            for name in wheel_zip.namelist():
                prefix = "pymupdf/mupdf-devel/"
                relative = name.removeprefix(prefix)
                if (
                    name.startswith(prefix + "include/mupdf/")
                    and relative in members
                    and name.endswith(".h")
                ):
                    original = mupdf.extractfile(members[relative]).read()
                    packaged = wheel_zip.read(name)
                    if relative == "include/mupdf/fitz/config.h":
                        require(
                            packaged.replace(b"\r\n", b"\n")
                            == b"#define TOFU_CJK_EXT 1 /* PyMuPDF override. */\n"
                            + original,
                            "Native provenance check failed",
                        )
                    else:
                        require(packaged == original, "Native provenance check failed")
                    headers.append(relative)
        records = {
            row[0].replace("\\", "/"): row
            for row in csv.reader(
                io.StringIO(wheel_zip.read("pymupdf-1.26.3.dist-info/RECORD").decode())
            )
        }
        chain = []
        for frozen_name in [
            "mupdfcpp64.dll",
            "pymupdf\\_mupdf.pyd",
            "pymupdf\\_extra.pyd",
        ]:
            leaf = frozen_name.replace("\\", "/").rsplit("/", 1)[-1]
            name = "pymupdf/" + leaf
            data = wheel_zip.read(name)
            row = records[name]
            require(
                row[1]
                == "sha256="
                + base64.urlsafe_b64encode(hashlib.sha256(data).digest())
                .decode()
                .rstrip("="),
                "Native provenance check failed",
            )
            require(
                len(data) == int(row[2]) and data == frozen.extract(frozen_name),
                "Native provenance check failed",
            )
            require(
                data == (Path(pymupdf.__file__).parent / leaf).read_bytes(),
                "Native provenance check failed",
            )
            chain.append(
                {
                    "wheelPath": name,
                    "frozenPath": frozen_name,
                    "bytes": len(data),
                    "sha256": sha(data),
                }
            )
        require(
            wheel_zip.read("pymupdf/_build.py").decode().strip()
            == "mupdf_location='https://mupdf.com/downloads/archive/mupdf-1.26.3-source.tar.gz'",
            "Native provenance check failed",
        )
    runtime = {
        "pymupdf": pymupdf.VersionBind,
        "mupdf": pymupdf.VersionFitz,
        "runtimeNativeBytesMatchShipped": True,
    }
    require(
        runtime["pymupdf"] == runtime["mupdf"] == "1.26.3",
        "Native provenance check failed",
    )
    sdk_path = OUT / "microsoft/microsoft.web.webview2.1.0.3650.58.nupkg"
    sdk_path.parent.mkdir(exist_ok=True)
    download(sdk_path, SDK_URL, SDK_SHA)
    crate = next(
        Path(p)
        for p in json.loads((BASE / "local-build-inputs.json").read_text())
        if Path(p).name == "webview2-com-sys-0.38.2"
    )
    with zipfile.ZipFile(sdk_path) as sdk:
        loader = sdk.read("build/native/x64/WebView2LoaderStatic.lib")
        require(
            loader == (crate / "x64/WebView2LoaderStatic.lib").read_bytes(),
            "Native provenance check failed",
        )
        sdk_notices = OUT / "supplemental-notices/WebView2-SDK-1.0.3650.58"
        sdk_notices.mkdir(parents=True, exist_ok=True)
        for name in ["LICENSE.txt", "NOTICE.txt"]:
            (sdk_notices / name).write_bytes(sdk.read(name))
    outputs = list(
        (ROOT / "apps/desktop/src-tauri/target/release/build").glob(
            "webview2-com-sys-*/out/x64/WebView2LoaderStatic.lib"
        )
    )
    require(
        outputs and all((path.read_bytes() == loader for path in outputs)),
        "Native provenance check failed",
    )
    require(
        all(("webview2loader" not in name.lower() for name in frozen.toc)),
        "Native provenance check failed",
    )
    require(
        all(
            (
                "webview2loader" not in path.name.lower()
                for path in installed.rglob("*.dll")
            )
        ),
        "Native provenance check failed",
    )
    require(
        'link(name = "WebView2LoaderStatic", kind = "static")'
        in (crate / "src/lib.rs").read_text(),
        "Native provenance check failed",
    )
    vswhere = Path(
        "C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    )
    visual_studio = json.loads(
        subprocess.check_output(
            [str(vswhere), "-all", "-products", "*", "-format", "json", "-utf8"],
            text=True,
            encoding="utf-8-sig",
        )
    )
    environment = [
        {
            key: entry.get(key)
            for key in [
                "installationPath",
                "installationVersion",
                "productId",
                "channelId",
                "displayName",
            ]
        }
        for entry in visual_studio
    ]
    terms = []
    for name, (url, expected) in TERMS.items():
        path = sdk_path.parent / name
        download(path, url, expected)
        terms.append({**file_record(path), "url": url})
    analysis = ast.literal_eval(
        (
            ROOT
            / "services/pdf-engine/build/desktop-sidecar/work/pdf-engine/Analysis-00.toc"
        ).read_text("utf-8")
    )
    crt_names = {"msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"}
    crt_inputs = []

    def visit(value: object) -> None:
        if isinstance(value, (list, tuple)):
            if (
                len(value) == 3
                and isinstance(value[0], str)
                and value[0].lower() in crt_names
            ):
                require(
                    frozen.extract(value[0]) == Path(value[1]).read_bytes(),
                    "Native provenance check failed",
                )
                crt_inputs.append(
                    {
                        "name": value[0],
                        "analysisSource": value[1],
                        "sha256": sha(frozen.extract(value[0])),
                    }
                )
            for item in value:
                visit(item)

    visit(analysis)
    require(
        {entry["name"].lower() for entry in crt_inputs} == crt_names,
        "Native provenance check failed",
    )
    report = {
        "buildCommit": BUILD_COMMIT,
        "nsis": file_record(installer),
        "sourceArchive": file_record(source_zip),
        "wheel": {**file_record(wheel_path), "url": wheel["url"], "chain": chain},
        "runtime": runtime,
        "matchedMuPDFHeaders": len(headers),
        "configPatch": "TOFU_CJK_EXT=1 + Windows CRLF from PyMuPDF setup.py",
        "binaries": binaries,
        "staticBuild": graph,
        "visualStudio": environment,
        "crtInputs": crt_inputs,
        "microsoftTerms": terms,
        "webview2": {
            "sdkVersion": "1.0.3650.58",
            "sdkSha256": SDK_SHA,
            "loaderSha256": sha(loader),
            "form": "static in MSVC Tauri executable; no loader DLL shipped",
            "runtime": "Evergreen, not bundled; downloadBootstrapper if absent",
            "license": "Microsoft SDK LICENSE.txt (BSD-3-Clause text)",
            "status": "OK",
        },
        "crt": {
            "status": "NEEDS_REVIEW",
            "ownerDeclaration": "2026-10-30: Build Tools only; no other Visual Studio licence known",
            "issue": "No applicable redistribution grant established for the app-local CRT, notably System32 MSVCP140.dll 14.51.36247.0; Build Tools installation is not proof of such a grant.",
        },
        "scope": "Technical provenance evidence, not legal certification. No installed files changed.",
    }
    write_json(OUT / "native-inventory.json", report)
    write_json(OUT / "static-build-graph.json", graph)
    return report


def publish() -> dict:
    """Publish external assessment materials without modifying the original kit."""
    if not metadata_only():
        raise ValueError(
            "External review requires a clean tracked metadata-only commit"
        )
    proof = json.loads((OUT / "native-inventory.json").read_text("utf-8"))
    require(
        proof["nsis"]["sha256"] == NSIS_SHA
        and proof["sourceArchive"]["sha256"] == SOURCE_SHA,
        "Native provenance check failed",
    )
    installed = next((ROOT / "data/output/mvp-001").glob("installation * QA"))
    inventory = json.loads(
        (installed / "licenses/redistribution/inventory.json").read_text("utf-8")
    )
    original_manifest = json.loads((BASE / "RELEASE_MANIFEST.json").read_text("utf-8"))
    require(
        sha((installed / "licenses/redistribution/inventory.json").read_bytes())
        == original_manifest["inventorySha256"],
        "Native provenance check failed",
    )
    for row in inventory["rows"]:
        if row["name"] == "MuPDF and statically incorporated third-party libraries":
            row["status"] = (
                "OK"
                if all(
                    c["status"] == "OK"
                    for c in proof["staticBuild"]["components"].values()
                )
                else "NEEDS_REVIEW"
            )
            row["evidence"] = (
                "native-inventory.json: wheel RECORD, frozen bytes, 82 headers, Release x64 project graph"
            )
        elif row["name"] == "Microsoft CRT":
            row["status"] = proof["crt"]["status"]
            row["evidence"] = proof["crt"]["issue"]
        elif row["name"] == "WebView2Loader SDK":
            row["status"] = proof["webview2"]["status"]
            row["license"] = proof["webview2"]["license"]
            row["notices"] = (
                "supplemental-notices/WebView2-SDK-1.0.3650.58/LICENSE.txt + NOTICE.txt"
            )
            row["evidence"] = (
                "Byte-matched Microsoft NuGet SDK and Cargo release static library"
            )
    for name, component in proof["staticBuild"]["components"].items():
        inventory["rows"].append(
            {
                "name": "MuPDF static: " + name,
                **component,
                "distribution": "static project input in mupdfcpp64.dll; conservative source coverage",
            }
        )
    write_json(OUT / "redistribution-inventory.json", inventory)
    notices = OUT / "THIRD_PARTY_NOTICES_MVP-003.zip"
    with (
        zipfile.ZipFile(BASE / "THIRD_PARTY_NOTICES.zip") as original,
        zipfile.ZipFile(
            notices, "w", zipfile.ZIP_DEFLATED, strict_timestamps=False
        ) as target,
    ):
        for member in original.infolist():
            target.writestr(member, original.read(member))
        for path in (OUT / "supplemental-notices").rglob("*"):
            if path.is_file():
                target.write(path, path.relative_to(OUT).as_posix())
        for name in ["native-inventory.json", "redistribution-inventory.json"]:
            target.write(OUT / name, "mvp-003-review/" + name)
        target.write(
            ROOT / "THIRD_PARTY_NOTICES.md", "mvp-003-review/THIRD_PARTY_NOTICES.md"
        )
    original = json.loads((BASE / "RELEASE_MANIFEST.json").read_text("utf-8"))
    artifacts = [
        {**entry, "path": "../mvp-002/" + entry["file"]}
        for entry in original["artifacts"]
        if not entry["file"].endswith("NOTICES.zip")
    ]
    artifacts += [
        {**file_record(path), "path": path.name}
        for path in [
            notices,
            OUT / "native-inventory.json",
            OUT / "redistribution-inventory.json",
        ]
    ]
    manifest = {
        "application": original["application"],
        "version": original["version"],
        "commit": BUILD_COMMIT,
        "reviewCommit": git("rev-parse", "HEAD"),
        "buildDate": original["buildDate"],
        "configuration": original["configuration"],
        "nsisRebuilt": False,
        "sourcesChanged": False,
        "installedFilesChanged": False,
        "reviewedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "artifacts": artifacts,
        "status": "OK"
        if all(row["status"] in {"OK", "NOT_APPLICABLE"} for row in inventory["rows"])
        else "NEEDS_REVIEW",
    }
    write_json(OUT / "RELEASE_MANIFEST.json", manifest)
    return manifest


def verify_review(directory: Path = OUT) -> bool:
    """Fail closed on changed payloads, functional source changes, or pending rights."""
    manifest = json.loads((directory / "RELEASE_MANIFEST.json").read_text("utf-8"))
    if (
        manifest["commit"] != BUILD_COMMIT
        or manifest["reviewCommit"] != git("rev-parse", "HEAD")
        or not metadata_only()
    ):
        return False
    names = {entry["file"] for entry in manifest["artifacts"]}
    if (
        not {
            "native-inventory.json",
            "redistribution-inventory.json",
            "THIRD_PARTY_NOTICES_MVP-003.zip",
        }
        <= names
        or not any(name.endswith("_sources.zip") for name in names)
        or not any(name.endswith("_x64-setup.exe") for name in names)
    ):
        return False
    for artifact in manifest["artifacts"]:
        if (
            artifact["file"].endswith("_x64-setup.exe")
            and artifact["sha256"] != NSIS_SHA
        ):
            return False
        if (
            artifact["file"].endswith("_sources.zip")
            and artifact["sha256"] != SOURCE_SHA
        ):
            return False
        path = (directory / artifact["path"]).resolve()
        if not path.is_relative_to(ROOT / "data/output") or file_record(path) != {
            key: artifact[key] for key in ["file", "bytes", "sha256"]
        }:
            return False
    proof = json.loads((directory / "native-inventory.json").read_text("utf-8"))
    inventory = json.loads(
        (directory / "redistribution-inventory.json").read_text("utf-8")
    )
    if (
        proof["nsis"]["sha256"] != NSIS_SHA
        or proof["sourceArchive"]["sha256"] != SOURCE_SHA
    ):
        return False
    if (
        proof["matchedMuPDFHeaders"] != 82
        or proof["runtime"]["pymupdf"] != "1.26.3"
        or proof["runtime"]["mupdf"] != "1.26.3"
        or set(proof["staticBuild"]["components"]) != set(LICENSES)
    ):
        return False
    # Inventory edits alone cannot override the underlying rights assessment.
    if proof["crt"]["status"] != "OK" or proof["webview2"]["status"] != "OK":
        return False
    if not all(
        component["status"] == "OK"
        for component in proof["staticBuild"]["components"].values()
    ):
        return False
    return manifest["status"] == "OK" and all(
        row["status"] in {"OK", "NOT_APPLICABLE"} for row in inventory["rows"]
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument(
        "action", choices=["inspect", "publish"], default="inspect", nargs="?"
    )
    if parser.parse_args().action == "publish":
        print(json.dumps(publish(), indent=2))
    else:
        result = inspect()
        print(
            f"MuPDF wheel/source verified; {result['matchedMuPDFHeaders']} headers; {len(result['staticBuild']['components'])} vendored components."
        )
        print("WebView2 static loader: official SDK bytes and BSD notices verified.")
        print(
            "CRT: NEEDS_REVIEW — Build Tools-only declaration; no applicable app-local redistribution grant established."
        )

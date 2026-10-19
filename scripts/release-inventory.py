"""Inventory the frozen Windows payload, not the development environment.

Run after desktop:build with the same locked Python environment. No execution of
the sidecar is needed. Paths in the JSON are relative to the repository/archive.
The inventory is evidence, not a legal clearance or a static-link SBOM.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.metadata
import io
import json
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "services/pdf-engine/build/desktop-sidecar/work/pdf-engine"
NOTICES = ROOT / "services/pdf-engine/build/runtime-notices"
NATIVE_NOTICES = {
    "OpenSSL-LICENSE.txt": (
        "openssl/openssl/openssl-3.0.13/LICENSE.txt",
        "7d5450cb2d142651b8afa315b5f238efc805dad827d91ba367d8516bc9d49e7a",
    ),
    "zlib-LICENSE": (
        "madler/zlib/v1.3.1/LICENSE",
        "845efc77857d485d91fb3e0b884aaa929368c717ae8186b66fe1ed2495753243",
    ),
    "Expat-COPYING": (
        "libexpat/libexpat/R_2_6_0/expat/COPYING",
        "122f2c27000472a201d337b9b31f7eb2b52d091b02857061a8880371612d9534",
    ),
    "libxml2-Copyright": (
        "GNOME/libxml2/v2.11.9/Copyright",
        "c5c63674f8a83c4d2e385d96d1c670a03cb871ba2927755467017317878574bd",
    ),
    "libxslt-Copyright": (
        "GNOME/libxslt/v1.1.45/Copyright",
        "7e48e290b6bfccc2ec1b297023a1d77f2fd87417f71fbb9f50aabef40a851819",
    ),
}


def collect_native_notices() -> None:
    import pyexpat
    import ssl
    import zlib

    from lxml import etree

    versions = {
        "OpenSSL": ssl.OPENSSL_VERSION,
        "zlib": zlib.ZLIB_RUNTIME_VERSION,
        "Expat": pyexpat.EXPAT_VERSION,
        "libxml2": list(etree.LIBXML_VERSION),
        "libxslt": list(etree.LIBXSLT_VERSION),
    }
    if versions != {
        "OpenSSL": "OpenSSL 3.0.13 30 Jan 2024",
        "zlib": "1.3.1",
        "Expat": "expat_2.6.0",
        "libxml2": [2, 11, 9],
        "libxslt": [1, 1, 45],
    }:
        raise RuntimeError(f"Reaudit native notices for this runtime: {versions}")
    cache = ROOT / "services/pdf-engine/build/native-notice-cache"
    cache.mkdir(parents=True, exist_ok=True)
    target = NOTICES / "native"
    target.mkdir()
    sources = {}
    for name, (location, expected) in NATIVE_NOTICES.items():
        url = f"https://raw.githubusercontent.com/{location}"
        cached = cache / name
        content = (
            cached.read_bytes()
            if cached.is_file()
            else urllib.request.urlopen(url, timeout=30).read()
        )
        if hashlib.sha256(content).hexdigest() != expected:
            raise RuntimeError(f"Native notice checksum mismatch: {name}")
        cached.write_bytes(content)
        (target / name).write_bytes(content)
        sources[name] = {"url": url, **digest(content)}
    (target / "sources.json").write_text(
        json.dumps({"runtimeVersions": versions, "sources": sources}, indent=2),
        encoding="utf-8",
    )


def digest(content: bytes) -> dict:
    return {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}


def record(path: Path, base: Path = ROOT) -> dict:
    return {"path": path.relative_to(base).as_posix(), **digest(path.read_bytes())}


def entries(value):
    if isinstance(value, (list, tuple)):
        if (
            len(value) == 3
            and all(isinstance(item, str) for item in value)
            and value[2]
            in {"PYMODULE", "PYMODULE-1", "PYMODULE-2", "BINARY", "EXTENSION", "DATA"}
        ):
            yield value
        else:
            for item in value:
                yield from entries(item)


def frozen_packages() -> list[dict]:
    analysis = ast.literal_eval((BUILD / "Analysis-00.toc").read_text("utf-8"))
    sources = {Path(source).resolve() for _, source, _ in entries(analysis)}
    packages = []
    for dist in importlib.metadata.distributions():
        matched = [
            file
            for file in dist.files or []
            if dist.locate_file(file).resolve() in sources
        ]
        if not matched:
            continue
        licenses = []
        name = dist.metadata["Name"]
        for file in dist.files or []:
            if any(
                word in file.name.upper() for word in ("LICENSE", "COPYING", "NOTICE")
            ):
                source = dist.locate_file(file)
                if source.is_file():
                    # Keep relative paths: several wheels contain multiple LICENSEs.
                    relative = Path(str(file))
                    if relative.is_absolute() or ".." in relative.parts:
                        continue
                    target = NOTICES / name / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(source.read_bytes())
                    licenses.append(record(target, NOTICES))
        packages.append(
            {
                "name": name,
                "version": dist.version,
                "license": dist.metadata.get("License-Expression")
                or dist.metadata.get("License"),
                "frozenFiles": sorted(str(file).replace("\\", "/") for file in matched),
                "notices": licenses,
            }
        )
    return sorted(packages, key=lambda item: item["name"].lower())


def collect_notices() -> list[dict]:
    # This directory is exclusively generated. Clearing it avoids stale notices
    # for packages removed from the frozen artifact.
    NOTICES.resolve().relative_to(ROOT.resolve())
    if NOTICES.exists():
        shutil.rmtree(NOTICES)
    NOTICES.mkdir(parents=True)
    packages = frozen_packages()
    python_license = Path(sys.base_prefix) / "LICENSE.txt"
    if not python_license.is_file() and sys.platform == "win32":
        raise RuntimeError("The bundled Python runtime's LICENSE.txt is missing")
    if python_license.is_file():
        (NOTICES / "Python-LICENSE.txt").write_bytes(python_license.read_bytes())
    if sys.platform == "win32":
        collect_native_notices()
    import pymupdf

    (NOTICES / "runtime-versions.json").write_text(
        json.dumps(
            {
                "python": sys.version,
                "pymupdf": pymupdf.version[0],
                "mupdf": pymupdf.version[1],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (NOTICES / "frozen-packages.json").write_text(
        json.dumps(packages, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return packages


def inventory(output: Path, installed: Path | None) -> dict:
    from PyInstaller.archive.readers import CArchiveReader

    sidecar = (
        ROOT / "apps/desktop/src-tauri/binaries/pdf-engine-x86_64-pc-windows-msvc.exe"
    )
    archive = CArchiveReader(str(sidecar))
    payload = []
    for name, entry in sorted(archive.toc.items()):
        data = archive.extract(name)
        payload.append(
            {"path": name.replace("\\", "/"), "kind": entry[-1], **digest(data)}
        )
    pyz = archive.open_embedded_archive("PYZ.pyz")
    analysis = ast.literal_eval((BUILD / "Analysis-00.toc").read_text("utf-8"))
    expected_modules = {
        name for name, _, kind in entries(analysis) if kind.startswith("PYMODULE")
    }
    bootstrap_modules = {
        name for name, entry in archive.toc.items() if entry[-1] in {"m", "M"}
    }
    with zipfile.ZipFile(io.BytesIO(archive.extract("base_library.zip"))) as library:
        base_modules = {
            name[:-4].replace("/", ".").removesuffix(".__init__")
            for name in library.namelist()
            if name.endswith(".pyc")
        }
    if expected_modules != set(pyz.toc) | base_modules | (
        expected_modules & bootstrap_modules
    ):
        raise RuntimeError("The frozen module lists do not match Analysis-00.toc")
    artifacts = [record(sidecar)]
    version = json.loads(
        (ROOT / "apps/desktop/src-tauri/tauri.conf.json").read_text("utf-8")
    )["version"]
    excluded = []
    release = ROOT / "apps/desktop/src-tauri/target/release"
    for path in [
        release / "pdf-studio-local.exe",
        *sorted((release / "bundle").rglob("*.exe")),
        *sorted((release / "bundle").rglob("*.msi")),
    ]:
        if path.is_file():
            if path.parent == release or f"_{version}_" in path.name:
                artifacts.append(record(path))
            else:
                excluded.append(record(path))
    packages = json.loads((NOTICES / "frozen-packages.json").read_text("utf-8"))
    # Byte comparison ties the TOC-based package attribution to this executable.
    pkg = ast.literal_eval((BUILD / "PKG-00.toc").read_text("utf-8"))
    mismatches = []
    compared = 0
    for name, source, kind in entries(pkg):
        if kind in {"BINARY", "EXTENSION", "DATA"}:
            if (
                name not in archive.toc
                or archive.extract(name) != Path(source).read_bytes()
            ):
                mismatches.append(name)
            compared += 1
    if mismatches:
        raise RuntimeError(f"Stale build TOC or sidecar: {mismatches}")
    result = {
        "schemaVersion": 1,
        "sourceCommit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "sourceStatus": subprocess.check_output(
            ["git", "status", "--short"], cwd=ROOT, text=True
        ).splitlines(),
        "version": version,
        "artifacts": artifacts,
        "excludedHistoricalArtifacts": excluded,
        "archive": {
            "entries": payload,
            "pythonModules": sorted(pyz.toc),
            "bootstrapPythonModules": sorted(bootstrap_modules),
            "baseLibraryModules": sorted(base_modules),
            "sourceByteComparisons": compared,
        },
        "pythonPackages": packages,
        "ocr": json.loads(
            (ROOT / "services/pdf-engine/build/ocr/manifest.json").read_text("utf-8")
        ),
        "runtimeNotices": [
            record(path, NOTICES)
            for path in sorted(NOTICES.rglob("*"))
            if path.is_file()
        ],
        "webResources": [
            record(path, ROOT / "apps/web/dist")
            for path in sorted((ROOT / "apps/web/dist").rglob("*"))
            if path.is_file()
        ],
        "limitations": [
            "Python package attribution uses frozen Analysis paths; payload data/binaries are compared byte for byte.",
            "Static libraries inside native DLLs are not individually identified by this inventory.",
            "Web resource hashes do not identify all inlined npm dependencies; Rust static linkage requires separate review.",
            "No claim of clean-VM, WebView2 bootstrapper, or licence compliance validation.",
        ],
    }
    if installed:
        installed = installed.resolve()
        installed.relative_to(ROOT / "data/output")
        result["installedFiles"] = [
            record(path, installed)
            for path in sorted(installed.rglob("*"))
            if path.is_file()
        ]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("--collect-notices", action="store_true")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data/output/release-gate-006/component-inventory.json",
    )
    parser.add_argument("--installed", type=Path)
    args = parser.parse_args()
    args.output.resolve().relative_to(ROOT / "data/output")
    if args.collect_notices:
        packages = collect_notices()
        print(f"Collected notices for {len(packages)} frozen Python packages")
    else:
        result = inventory(args.output, args.installed)
        print(
            f"Inventory: {len(result['archive']['entries'])} archive entries, {len(result['archive']['pythonModules'])} modules; {args.output}"
        )


if __name__ == "__main__":
    main()

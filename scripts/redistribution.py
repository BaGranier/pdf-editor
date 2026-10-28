"""Collect actual build evidence and produce a commit-bound redistribution kit.

Statuses describe evidence completeness, never automatic legal certification.
No untracked files enter the application source archive. Outputs stay ignored.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import zipfile
import urllib.request
import datetime as dt
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/output/mvp-002"
NOTICES = ROOT / "services/pdf-engine/build/redistribution"
SOURCES = {
    "nsis-v311.tar.gz": ("https://codeload.github.com/kichik/nsis/tar.gz/refs/tags/v311", "6ba0e34576f95282e4c7ab4347c016eaaa929fb5f20c90c6a28fb84ca1e2724e"),
    "pymupdf-1.26.3.tar.gz": ("https://files.pythonhosted.org/packages/source/p/pymupdf/pymupdf-1.26.3.tar.gz", "b7d2c3ffa9870e1e4416d18862f5ccd356af5fe337b4511093bbbce2ca73b7e5"),
    "mupdf-1.26.3-source.tar.gz": ("https://mupdf.com/downloads/archive/mupdf-1.26.3-source.tar.gz", "ab467fc2d888cd8424cdce4bc6dd7ec61f34820582ddf3769a336e6909d9a48e"),
}


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def sha(path: Path) -> str:
    return hashlib.file_digest(path.open("rb"), "sha256").hexdigest()


def record(path: Path) -> dict:
    return {"file": path.name, "bytes": path.stat().st_size, "sha256": sha(path)}


def licenses(directory: Path, destination: Path) -> list[str]:
    found = []
    for source in directory.iterdir():
        if source.is_file() and re.match(r"(?i)(licen[cs]e|copying|notice|copyright)", source.name):
            destination.mkdir(parents=True, exist_ok=True)
            (destination / source.name).write_bytes(source.read_bytes())
            found.append((destination / source.name).relative_to(NOTICES).as_posix())
    return found


def prepare() -> dict:
    OUT.mkdir(parents=True, exist_ok=True)
    NOTICES.mkdir(parents=True, exist_ok=True)
    for name, (url, expected) in SOURCES.items():
        target = OUT / name
        if not target.exists():
            target.write_bytes(urllib.request.urlopen(url, timeout=120).read())
        if sha(target) != expected:
            raise ValueError(f"Upstream source checksum mismatch: {name}")
    rows = []

    def add(name, version, role, license, upstream, form, notice, source, status="OK"):
        rows.append(dict(name=name, version=version, role=role, license=license, upstream=upstream,
                         form=form, notices=notice, correspondingSource=source, status=status))

    add("PDF Studio Local", "0.1.0", "application", "AGPL-3.0", "source commit in RELEASE_MANIFEST.json", "Tauri frontend and shell + FastAPI sidecar", "licenses/application-AGPL-3.0.txt", "complete tracked application tree in sources ZIP")

    evidence = json.loads((ROOT / "apps/web/build/frontend-modules.json").read_text("utf-8"))
    names = set()
    for module in evidence["modules"]:
        if "/node_modules/" in module.replace("\\", "/"):
            tail = module.replace("\\", "/").rsplit("/node_modules/", 1)[1]
            names.add("/".join(tail.split("/")[:2]) if tail.startswith("@") else tail.split("/")[0])
    # Vite emits this prebuilt worker as an asset, not a rendered Rollup module.
    worker = ROOT / "apps/web/node_modules/pdfjs-dist/build/pdf.worker.mjs"
    if not any(sha(path) == sha(worker) for path in (ROOT / "apps/web/dist/assets").glob("pdf.worker-*.mjs")):
        raise ValueError("Emitted PDF worker does not match pdfjs-dist")
    names.add("pdfjs-dist")
    for name in sorted(names):
        directory = ROOT / "apps/web/node_modules" / name
        package = json.loads((directory / "package.json").read_text("utf-8"))
        notices = licenses(directory, NOTICES / "npm" / name)
        add(name, package["version"], "frontend", package.get("license", "UNKNOWN"), package.get("homepage", package.get("repository", "npm")), "rendered chunk module or byte-matched worker", notices, "no", "OK" if notices else "NEEDS_REVIEW")

    metadata = json.loads(subprocess.check_output(["cargo", "metadata", "--locked", "--format-version=1", "--filter-platform=x86_64-pc-windows-msvc", "--manifest-path", str(ROOT / "apps/desktop/src-tauri/Cargo.toml")], cwd=ROOT))
    packages = {package["id"]: package for package in metadata["packages"]}
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    pending = [metadata["resolve"]["root"]]
    seen = set()
    rust_sources = []
    while pending:
        identifier = pending.pop()
        if identifier in seen:
            continue
        seen.add(identifier)
        pending.extend(dep["pkg"] for dep in nodes[identifier]["deps"] if any(kind["kind"] is None for kind in dep["dep_kinds"]))
        package = packages[identifier]
        if not package["source"]:
            continue
        directory = Path(package["manifest_path"]).parent
        # Confirm source participated in this release compilation, not merely a lockfile entry.
        name = package["name"].replace("-", "_")
        depfiles = list((ROOT / "apps/desktop/src-tauri/target/release/deps").glob(f"{name}-*.d"))
        if not depfiles:
            continue
        notices = licenses(directory, NOTICES / "rust" / f"{package['name']}-{package['version']}")
        if not notices:
            locked = json.loads((ROOT / "scripts/release-notice-sources.json").read_text("utf-8"))
            for entry in locked.get(f"{package['name']}@{package['version']}", []):
                cache = NOTICES / "upstream-cache" / hashlib.sha256(entry["url"].encode()).hexdigest()
                cache.parent.mkdir(exist_ok=True)
                if not cache.exists():
                    cache.write_bytes(urllib.request.urlopen(entry["url"], timeout=60).read())
                if sha(cache) != entry["sha256"]:
                    raise ValueError("Upstream notice hash mismatch")
                destination = NOTICES / "rust" / f"{package['name']}-{package['version']}" / entry["name"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(cache.read_bytes())
                notices.append(destination.relative_to(NOTICES).as_posix())
        rust_sources.append(str(directory))
        add(package["name"], package["version"], "Rust", package.get("license") or "UNKNOWN", package.get("repository"), "target-resolved normal dependency with release .d evidence; conservative linked/generated-code coverage", notices, "included in sources archive", "OK" if notices and package.get("license") else "NEEDS_REVIEW")

    frozen = json.loads((ROOT / "services/pdf-engine/build/runtime-notices/frozen-packages.json").read_text("utf-8"))
    for package in frozen:
        add(package["name"], package["version"], "Python sidecar", package.get("license") or "see bundled license texts", f"https://pypi.org/project/{package['name']}/{package['version']}/", "Analysis paths + byte-compared PyInstaller payload", [n["path"] for n in package["notices"]], "PyMuPDF included; permissive packages retain notices")
    native_notices = []
    archive = OUT / "mupdf-1.26.3-source.tar.gz"
    with tarfile.open(archive) as tar:
        for member in tar.getmembers():
            leaf = Path(member.name).name
            if member.isfile() and (re.match(r"(?i)^(copying|license|copyright|notice)([.\-_].*)?$", leaf) or leaf.upper() in {"FTL.TXT", "GPLV2.TXT"} or ("libjpeg/" in member.name and leaf == "README")):
                target = NOTICES / "mupdf-source" / member.name
                if not target.resolve().is_relative_to(NOTICES.resolve()):
                    raise ValueError("Unsafe upstream archive path")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
                native_notices.append(target.relative_to(NOTICES).as_posix())
    add("MuPDF and statically incorporated third-party libraries", "1.26.3", "native PDF/OCR/codecs", "AGPL-3.0 + upstream component licenses", "https://mupdf.com/downloads/archive/mupdf-1.26.3-source.tar.gz", "mupdfcpp64.dll in frozen archive", native_notices, "MuPDF complete source archive included", "NEEDS_REVIEW")
    add("Tesseract / Leptonica", "MuPDF 1.26.3 vendored revisions", "OCR", "Apache-2.0 / BSD", "MuPDF thirdparty source tree", "incorporated native OCR", "licenses/ocr + complete MuPDF source notices", "included in MuPDF source")
    add("CPython and native runtime libraries", "3.11.9; versions/hashes in runtime inventory", "sidecar runtime", "PSF + per-library texts", "CPython 3.11.9 / native runtime-notices", "python311.dll, OpenSSL, Expat, zlib and native extensions in archive", "licenses/runtime/Python-LICENSE.txt + licenses/runtime/native + package licenses", "permissive notices; native linkage clearance included in native-payload dossier")
    with tarfile.open(OUT / "nsis-v311.tar.gz") as tar:
        member = next(member for member in tar.getmembers() if member.name.endswith("/COPYING"))
        destination = NOTICES / "NSIS-COPYING.txt"
        destination.write_bytes(tar.extractfile(member).read())
    add("NSIS", "3.11", "installer", "zlib/libpng + bzip2 + CPL-1.0 (LZMA)", "https://github.com/kichik/nsis/tree/v311", "NSIS stub/plugins and LZMA compressor, generated installer.nsi selects lzma", "NSIS-COPYING.txt", "complete upstream source included; no linkage mode change")
    add("tessdata eng/fra/osd", "87416418657359cb625c412a48b6e1d6d41c29bd", "OCR data", "Apache-2.0", "https://github.com/tesseract-ocr/tessdata_fast", "byte-inventoried traineddata", "licenses/ocr/tessdata-LICENSE.txt", "data with locked hashes in build script")
    add("Bundled font families", "repository pinned TTF/OTF bytes", "text", "OFL / Ubuntu / DejaVu / Liberation; per-font NOTICE", "apps/web/public/fonts/NOTICE.md", "web assets + frozen fonts/", "fonts/NOTICE.md and LICENSE-*", "font binaries and notices in application sources")
    add("Microsoft CRT", "MSVCP140 / VCRUNTIME140 / VCRUNTIME140_1, exact DLL hashes in component inventory", "native runtime", "Microsoft redistributable terms", "https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution", "DLLs in frozen Python payload; UCRT is OS dependency", "Microsoft terms referenced in THIRD_PARTY_NOTICES.md", "not an open-source source obligation", "NEEDS_REVIEW")
    add("WebView2", "bootstrapper downloaded by installer", "WebView runtime", "Microsoft WebView2 terms", "https://developer.microsoft.com/en-us/microsoft-edge/webview2/", "downloadBootstrapper; no fixed offline runtime", "installer terms + user prerequisites", "not applicable", "NOT_APPLICABLE")
    add("WebView2Loader SDK", "webview2-com-sys 0.38.2 bundled loader", "native WebView loader", "Microsoft SDK terms, distinct from MIT Rust bindings", "https://github.com/wravery/webview2-rs", "static loader link declared in bindings; no fixed WebView runtime", "native Microsoft clearance dossier", "not an open-source source obligation", "NEEDS_REVIEW")
    add("OCRmyPDF / Ghostscript / QPDF / LibreOffice", "not packaged", "development/QA only", "not applicable", "component inventory", "no archive or installed executable entries", "not applicable", "not applicable", "NOT_APPLICABLE")
    (OUT / "local-build-inputs.json").write_text(json.dumps(rust_sources), "utf-8")
    evidence["modules"] = [module.replace(str(ROOT).replace("\\", "/") + "/", "") for module in evidence["modules"]]
    result = {"rows": rows, "rustSourcePackages": [Path(directory).name for directory in rust_sources], "frontendEvidence": evidence}
    (NOTICES / "inventory.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    lines = ["# Third-party redistribution inventory", "", "Evidence completeness; not a legal certificate.", "", "| Component | Version | Role | License | Form | Sources | Status |", "|---|---|---|---|---|---|---|"]
    for row in rows:
        lines.append("| " + " | ".join(str(row[key]).replace("|", "/").replace("\n", " ") for key in ["name", "version", "role", "license", "form", "correspondingSource", "status"]) + " |")
    lines += ["", "Full upstream URLs and notice paths: inventory.json. Rust coverage includes generated-code candidates; dead-code removal is not inferred from Cargo.lock.", "", "Native wheel provenance and CRT redistribution clearance remain a single native-payload clearance dossier; no OK is inferred from successful compilation."]
    (NOTICES / "THIRD_PARTY_NOTICES.md").write_text("\n".join(lines), "utf-8")
    (NOTICES / "build-provenance.json").write_text(json.dumps({"commit": git("rev-parse", "HEAD"), "trackedChanges": git("diff", "HEAD", "--name-only"), "date": dt.datetime.now(dt.timezone.utc).isoformat(), "sources": {name: record(OUT / name) for name in SOURCES}}, indent=2), "utf-8")
    return result


def kit() -> dict:
    if git("diff", "HEAD", "--name-only"):
        raise ValueError("Release requires committed tracked sources")
    commit = git("rev-parse", "HEAD")
    provenance = json.loads((NOTICES / "build-provenance.json").read_text("utf-8"))
    if provenance["commit"] != commit or provenance["trackedChanges"]:
        raise ValueError("Build provenance must identify this clean commit")
    version = json.loads((ROOT / "apps/desktop/src-tauri/tauri.conf.json").read_text("utf-8"))["version"]
    inventory = json.loads((NOTICES / "inventory.json").read_text("utf-8"))
    target = OUT / f"PDF-Studio-Local_{version}_{commit[:12]}_sources.zip"
    application = subprocess.check_output(["git", "archive", "--format=zip", commit], cwd=ROOT)
    # Cargo registry sources may carry Unix-epoch mtimes, outside ZIP's range.
    # Clamp only their ZIP metadata; preserve every source byte unchanged.
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, strict_timestamps=False) as output, zipfile.ZipFile(io.BytesIO(application)) as source:
        for member in source.infolist():
            if member.filename.startswith(("data/input/", "data/output/")) or Path(member.filename).name.startswith(".env"):
                continue
            output.writestr("application/" + member.filename, source.read(member))
        output.writestr("SOURCE_COMMIT.txt", commit + "\n")
        for name in SOURCES:
            output.write(OUT / name, "third-party/" + name)
        for directory in json.loads((OUT / "local-build-inputs.json").read_text("utf-8")):
            directory = Path(directory)
            for path in directory.rglob("*"):
                if path.is_file() and path.suffix.lower() not in {".dll", ".exe", ".lib"} and not any(part in {".git", "target"} for part in path.relative_to(directory).parts):
                    output.write(path, f"third-party/rust/{directory.name}/" + path.relative_to(directory).as_posix())
    notices = OUT / "THIRD_PARTY_NOTICES.zip"
    with zipfile.ZipFile(notices, "w", zipfile.ZIP_DEFLATED, strict_timestamps=False) as output:
        for directory in [NOTICES, ROOT / "services/pdf-engine/build/runtime-notices", ROOT / "services/pdf-engine/build/ocr/notices", ROOT / "apps/web/public/fonts"]:
            for path in directory.rglob("*"):
                if path.is_file() and (directory.name != "fonts" or path.suffix.lower() in {".txt", ".md"}):
                    output.write(path, directory.name + "/" + path.relative_to(directory).as_posix())
        output.write(ROOT / "LICENSE", "APPLICATION-LICENSE.txt")
    nsis = ROOT / f"apps/desktop/src-tauri/target/release/bundle/nsis/PDF Studio Local_{version}_x64-setup.exe"
    if nsis.stat().st_mtime < dt.datetime.fromisoformat(provenance["date"]).timestamp():
        raise ValueError("NSIS predates build provenance; rebuild this commit")
    shutil.copy2(nsis, OUT / nsis.name)
    manifest = {"application": "PDF Studio Local Windows Preview", "version": version, "commit": commit,
                "buildDate": provenance["date"],
                "configuration": {"target": "Windows x64 Tauri NSIS", "signed": False, "webview2": "downloadBootstrapper", "cleanVM": "À VALIDER MANUELLEMENT"},
                "artifacts": [record(path) for path in [nsis, target, notices]],
                "evidence": {"nativeInventory": "component-inventory.json", "buildProvenance": provenance},
                "inventorySha256": sha(NOTICES / "inventory.json"),
                "status": "NEEDS_REVIEW" if any(row["status"] in {"NEEDS_REVIEW", "BLOCKED"} for row in inventory["rows"]) else "OK"}
    (OUT / "RELEASE_MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
    return manifest


def verify() -> bool:
    manifest = json.loads((OUT / "RELEASE_MANIFEST.json").read_text("utf-8"))
    if manifest["commit"] != git("rev-parse", "HEAD") or git("diff", "HEAD", "--name-only"):
        return False
    inventory = json.loads((NOTICES / "inventory.json").read_text("utf-8"))
    if any(row["status"] not in {"OK", "NOT_APPLICABLE"} for row in inventory["rows"]):
        return False
    for artifact in manifest["artifacts"]:
        path = OUT / artifact["file"]
        if artifact["file"].endswith("setup.exe"):
            path = ROOT / "apps/desktop/src-tauri/target/release/bundle/nsis" / artifact["file"]
        if record(path) != artifact:
            return False
        if artifact["file"].endswith("_sources.zip"):
            with zipfile.ZipFile(path) as archive:
                if archive.read("SOURCE_COMMIT.txt").decode().strip() != manifest["commit"]:
                    return False
    return manifest["status"] == "OK" and sha(NOTICES / "inventory.json") == manifest["inventorySha256"]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("action", choices=["prepare", "kit", "verify"])
    action = parser.parse_args().action
    if action == "verify":
        try:
            valid = verify()
        except (OSError, ValueError, KeyError):
            valid = False
        print("PASS" if valid else "NEEDS_REVIEW: redistribution kit incomplete or native-payload clearance open")
        raise SystemExit(0 if valid else 2)
    result = prepare() if action == "prepare" else kit()
    print("Prepared redistribution evidence" if action == "prepare" else json.dumps(result, indent=2))

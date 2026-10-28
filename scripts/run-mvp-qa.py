"""Reproducible Preview gate. WIP and missing native evidence are never PASS.

No installer is executed and no evidence is invented by this runner. Native
qualification must target the exact Windows binary and built web payload.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
ENGINE = ROOT / "services/pdf-engine"
DESKTOP = ROOT / "apps/desktop"
E2E_SPECS = [
    "pdf-opening", "document-navigation", "viewer-modes", "zoom-and-scroll",
    "editing-core", "editing-interactions", "save-editing", "organize-pages",
    "export", "persistence", "storage-upgrade", "pdf-search", "pdf-forms",
    "comments", "shape-editing", "freehand-controls", "text-markup", "mvp-boundaries",
]
BACKEND_FILES = [
    "test_main", "test_clean_integration", "test_forms", "test_passwords",
    "test_export_organize", "test_global_composition", "test_native_text_edit",
    "test_shape_export", "test_freehand_export", "test_text_markup_export",
    "test_comments", "test_conversion", "test_conversion_filenames",
    "test_desktop_server", "test_desktop_entrypoint", "test_ocr", "test_ocr_runtime",
    "test_release_inventory", "test_qa_assets",
]


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    directory = ROOT / "data/output/mvp-gate" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    directory.mkdir(parents=True, exist_ok=False)
    report: dict = {
        "scope": "Windows x64 MVP Preview", "results": [],
        "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "worktree": subprocess.check_output(["git", "status", "--short"], cwd=ROOT, text=True).splitlines(),
    }
    environment = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": str(ROOT / ".playwright-browsers"), "UV_CACHE_DIR": str(ROOT / ".uv-cache")}

    def record(name: str, status: str, detail: str, required: bool = True):
        report["results"].append(dict(name=name, status=status, detail=detail, required=required))
        print(f"{status}: {name}: {detail}", flush=True)

    def run(name: str, command: list[str], cwd: Path, junit: Path | None = None, playwright_json: Path | None = None):
        executable = shutil.which(command[0])
        if executable is None:
            record(name, "NON TESTABLE DANS CET ENVIRONNEMENT", f"Missing executable: {command[0]}")
            return
        log = directory / f"{name}.log"
        try:
            with log.open("w", encoding="utf-8") as stream:
                command_environment = {**environment}
                if playwright_json:
                    command_environment["PLAYWRIGHT_JSON_OUTPUT_FILE"] = str(playwright_json)
                result = subprocess.run([executable, *command[1:]], cwd=cwd, env=command_environment, stdout=stream, stderr=subprocess.STDOUT, timeout=1200)
            status = "PASS" if result.returncode == 0 else "FAIL"
            detail = f"exit={result.returncode}; {log.relative_to(ROOT).as_posix()}"
            if junit and junit.exists():
                suites = ET.parse(junit).getroot()
                skipped = len(suites.findall(".//testcase/skipped"))
                if skipped and status == "PASS":
                    status = "NON TESTABLE DANS CET ENVIRONNEMENT"
                    detail += f"; {skipped} required tests skipped"
            if playwright_json and playwright_json.exists():
                stats = json.loads(playwright_json.read_text("utf-8"))["stats"]
                detail += f"; {stats}"
                if stats.get("skipped", 0) and status == "PASS":
                    status = "NON TESTABLE DANS CET ENVIRONNEMENT"
            record(name, status, detail)
        except (OSError, subprocess.TimeoutExpired) as error:
            record(name, "FAIL", f"{type(error).__name__}; see {log.relative_to(ROOT)}")

    run("prepare", ["uv", "run", "--project", str(ENGINE), "python", "-m", "scripts.prepare-qa-assets", "--mode", "backend"], ROOT)
    run("ocr-resources", ["uv", "run", "--project", str(ENGINE), "python", "-m", "scripts.prepare-ocr-resources"], ROOT)
    for name, script in [("frontend-tests", "test:run"), ("frontend-types", "lint"), ("e2e-types", "typecheck:e2e"), ("frontend-build", "build")]:
        run(name, ["npm", "run", script], WEB)
    junit = directory / "backend.xml"
    run("backend-core", ["uv", "run", "pytest", *[f"tests/{name}.py" for name in BACKEND_FILES], "-m", "not integration", f"--junitxml={junit}"], ENGINE, junit)
    junit = directory / "ocr-bundled.xml"
    run("ocr-bundled", ["uv", "run", "pytest", "tests/test_ocr_orientation.py", "tests/test_ocr_runtime.py", "-k", "not system_deskew_measurement", f"--junitxml={junit}"], ENGINE, junit)
    run("backend-lint", ["uv", "run", "ruff", "check", "."], ENGINE)
    for project in ["chromium", "firefox"]:
        run(project, ["npx", "playwright", "test", *[f"e2e/specs/{name}.spec.ts" for name in E2E_SPECS], f"--project={project}", "--grep-invert", "@slow", "--workers=1", "--reporter=line,json", f"--output={directory / project}"], WEB, playwright_json=directory / f"{project}.json")
    run("desktop-source", ["npm", "run", "desktop:check"], DESKTOP)
    run("rust", ["cargo", "test", "--locked", "--manifest-path", "apps/desktop/src-tauri/Cargo.toml", "--lib"], ROOT)
    if sys.platform == "win32":
        run("package-resources", ["npm", "run", "desktop:check-package"], DESKTOP)
    else:
        record("package-resources", "NON TESTABLE DANS CET ENVIRONNEMENT", "Windows x64 package required")
    native_file = ROOT / "data/output/mvp-001/native-mvp.json"
    try:
        native = json.loads(native_file.read_text("utf-8"))
        executable = (ROOT / native["executable"]).resolve()
        valid = native["status"] == "PASS" and executable.is_relative_to(ROOT / "data/output") and digest(executable) == native["sha256"]
        sidecar = (ROOT / native["sidecar"]).resolve()
        valid = valid and sidecar.is_relative_to(ROOT / "data/output") and digest(sidecar) == native["sidecarSha256"] == digest(ROOT / "apps/desktop/src-tauri/binaries/pdf-engine-x86_64-pc-windows-msvc.exe")
        valid = valid and all(digest(ROOT / filename) == value for filename, value in native["webHashes"].items())
        valid = valid and bool(native["webHashes"]) and all(native["checks"].get(name) == "PASS" for name in ["startup", "save", "large-save-policy", "ocr-bundled", "export-reopen", "installed-web-payload"])
        record("windows-installed", "PASS" if valid else "FAIL", str(native_file.relative_to(ROOT)))
    except (OSError, ValueError, KeyError, TypeError):
        record("windows-installed", "NON TESTABLE DANS CET ENVIRONNEMENT", "Exact installed artifact evidence missing/stale; run native qualification")
    distribution = subprocess.run([sys.executable, "-m", "scripts.redistribution", "verify"], cwd=ROOT, capture_output=True, text=True)
    (directory / "distribution.log").write_text(distribution.stdout + distribution.stderr, "utf-8")
    record("distribution", "PASS" if distribution.returncode == 0 else "WIP" if distribution.returncode == 2 else "FAIL", distribution.stdout.strip())
    for name, reason in [
        ("integrated-print", "Windows print dialog unqualified; supported fallback is Save/Export then external reader"),
        ("native-text-fidelity", "Partial native editing; existing <0.5 px sentinel unchanged and outside MVP acceptance"),
        ("system-ocr", "System fra/Tesseract is separate from the bundled runtime"),
        ("linux-macos", "Outside the Windows Preview support scope"),
    ]:
        record(name, "WIP", reason, required=False)
    report["corePass"] = all(row["status"] == "PASS" for row in report["results"] if row["required"] and row["name"] not in {"distribution", "windows-installed"})
    report["shareable"] = all(row["status"] == "PASS" for row in report["results"] if row["required"])
    report["decision"] = "MVP PARTAGEABLE" if report["shareable"] else "MVP NON PARTAGEABLE"
    for target in [directory / "results.json", directory.parent / "latest.json"]:
        target.write_text(json.dumps(report, indent=2, ensure_ascii=False), "utf-8")
    print(report["decision"], flush=True)
    return 0 if report["shareable"] else 1 if any(row["status"] == "FAIL" for row in report["results"] if row["required"]) else 2


if __name__ == "__main__":
    raise SystemExit(main())

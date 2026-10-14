"""Prepare and validate synthetic QA inputs; never rewrite an existing asset.

No network unless --download-ocr is explicitly supplied. Generator staging and
cleanup are restricted to known QA files, never data/input or test results.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import fitz
from pypdf.errors import PyPdfError

ROOT = Path(__file__).resolve().parents[1]
SMALL = Path("apps/web/e2e/fixtures")
INTEGRATION = Path("data/output/windows-qa-004/fixtures")
ROBUSTNESS = Path("data/output/editor-robustness-008")
BASE_PAGES = {
    "pdf-small-1-page.pdf": 1,
    "pdf-small-5-pages.pdf": 5,
    "pdf-text-position.pdf": 1,
    "pdf-native-text.pdf": 1,
    "pdf-acroform.pdf": 1,
    "pdf-landscape-portrait.pdf": 4,
    "pdf-long.pdf": 30,
    "conversion-simple-text.pdf": 2,
    "conversion-two-columns.pdf": 1,
    "conversion-table.pdf": 1,
    "conversion-images.pdf": 1,
    "conversion-scan.pdf": 1,
    "conversion-scan-french.pdf": 1,
    "conversion-mixed.pdf": 2,
    "conversion-landscape.pdf": 1,
    "conversion-docx-fidelity.pdf": 3,
    "editor-slides-20.pdf": 20,
}
ORIENTATIONS = (
    "0",
    "90",
    "180",
    "270",
    "skew-positive",
    "skew-negative",
    "contrast",
    "multipage",
)
PROTECTED = ("password-protected.pdf", *(f"ocr-oriented-{n}.pdf" for n in ORIENTATIONS))
BASE = (
    *BASE_PAGES,
    "pdf-corrupted.pdf",
    "editor-image.png",
    "editor-image.jpg",
    "editor-image-oriented.jpg",
)
INTEGRATION_FILES = (
    *(f"image-{size}.{ext}" for size in ("2m", "5m", "10m") for ext in ("png", "jpeg")),
    "scan-multipage-rotated.pdf",
    "scan-interrupt-50.pdf",
    "manifest.json",
)
ROBUSTNESS_FILES = (
    "scene.pdf",
    "scene.json",
    "manifest.json",
    *(f"asset-{i:02}.{'png' if i % 2 == 0 else 'jpeg'}" for i in range(20)),
)
CORRUPTED = (
    b"%PDF-1.7\n% deterministic fixture intentionally corrupted\n"
    b"1 0 obj << /Type /Catalog >> endobj\n%% missing xref and trailer"
)


@dataclass(frozen=True)
class Group:
    directory: Path
    names: tuple[str, ...]
    generator: str
    arguments: tuple[str, ...] = ()


def groups(mode: str, skip_large: bool = False) -> list[Group]:
    result = [
        Group(SMALL, tuple(BASE), "generate-qa-pdfs"),
        Group(SMALL, PROTECTED, "generate-protection-ocr-fixtures"),
    ]
    if mode != "backend":
        result.extend(
            [
                Group(
                    INTEGRATION,
                    INTEGRATION_FILES,
                    "generate-clean-integration-fixtures",
                ),
                Group(ROBUSTNESS, ROBUSTNESS_FILES, "editor-robustness-fixtures"),
            ]
        )
        if not skip_large:
            result.append(
                Group(
                    SMALL, ("pdf-large.pdf",), "generate-qa-pdfs", ("--include-large",)
                )
            )
    return result


def require(condition: bool, path: Path, reason: str) -> None:
    if not condition:
        raise ValueError(
            f"QA asset invalid: {path}: {reason}. Remove only this "
            "regenerable file, then rerun preparation."
        )


def validate_file(path: Path) -> None:
    """Semantic checks for PDFs (encrypted IDs are random); decode every image."""
    require(not path.is_symlink(), path, "symlink is not a synthetic QA asset")
    require(path.is_file() and path.stat().st_size > 0, path, "missing/empty")
    name = path.name
    if name == "pdf-corrupted.pdf":
        require(path.read_bytes() == CORRUPTED, path, "intentional corruption witness")
    elif path.suffix.lower() in (".png", ".jpg", ".jpeg"):
        image = fitz.Pixmap(path)
        expected = None
        if name.startswith("image-"):
            axis = {"2m": 850, "5m": 1350, "10m": 1900}[
                name.split("-")[1].split(".")[0]
            ]
            expected = (axis, axis)
        elif name.startswith("asset-"):
            expected = (1600, 1280) if int(name[6:8]) < 2 else (512, 384)
        require(image.width > 0 and image.height > 0, path, "image dimensions")
        if expected:
            require((image.width, image.height) == expected, path, "image dimensions")
    elif path.suffix == ".pdf":
        with fitz.open(path) as pdf:
            require(not pdf.is_repaired, path, "PDF required structural repair")
            if not pdf.needs_pass:
                validator = importlib.import_module("scripts.validate-qa-pdf")
                try:
                    validator.validate_structure(path, pdf.page_count).close()
                except PyPdfError as error:
                    raise ValueError(f"QA PDF structure invalid: {path}: {error}") from error
            if name == "password-protected.pdf":
                require(bool(pdf.needs_pass), path, "password required")
                require(
                    bool(pdf.authenticate("synthetic-open")), path, "synthetic password"
                )
                require(
                    "PROTECTED PDF WITNESS" in pdf[0].get_text(), path, "text witness"
                )
            pages = BASE_PAGES.get(
                name,
                {
                    "pdf-large.pdf": 250,
                    "scan-multipage-rotated.pdf": 5,
                    "scan-interrupt-50.pdf": 50,
                    "ocr-oriented-multipage.pdf": 3,
                }.get(name, 1),
            )
            require(pdf.page_count == pages, path, f"expected {pages} pages")
            for page in pdf:
                require(
                    page.rect.width > 0 and page.rect.height > 0,
                    path,
                    "page dimensions",
                )
                if name.startswith(("ocr-oriented-", "scan-", "conversion-scan")):
                    require(
                        not page.get_text().strip(), path, "scan contains hidden text"
                    )
                    require(bool(page.get_image_info()), path, "scan has no image")
            if name.startswith("ocr-oriented-"):
                expected = (
                    (650, 500)
                    if name in ("ocr-oriented-90.pdf", "ocr-oriented-270.pdf")
                    else (500, 650)
                )
                require(
                    tuple(pdf[0].rect)[2:] == expected, path, "orientation dimensions"
                )
            if name == "scan-multipage-rotated.pdf":
                require(pdf[-1].rotation == 90, path, "last page rotation")
            if name == "conversion-simple-text.pdf":
                require(
                    "français : été, élève, Noël" in pdf[0].get_text(),
                    path,
                    "accent witness",
                )
            if name == "scene.pdf":
                require("SOURCE SELECTABLE" in pdf[0].get_text(), path, "source text")
                require(bool(list(pdf[0].widgets())), path, "source form")
            if name == "pdf-large.pdf":
                require(path.stat().st_size > 50 * 1024**2, path, "expected >50 MiB")
    elif name == "scene.json":
        scene = json.loads(path.read_text(encoding="utf-8"))
        require(
            len(scene["edits"]) == 13 and len(scene["assets"]) == 2, path, "scene model"
        )
    elif name == "manifest.json":
        require(
            isinstance(json.loads(path.read_text(encoding="utf-8")), dict),
            path,
            "manifest object",
        )


def validate_group(directory: Path, group: Group) -> None:
    for name in group.names:
        validate_file(directory / name)
    if group.directory == ROBUSTNESS:
        manifest = json.loads((directory / "manifest.json").read_text())
        require(manifest.get("schemaVersion") == 1, directory, "manifest version")
        assets = manifest["assets"]
        require(
            [a["fileName"] for a in assets] == list(ROBUSTNESS_FILES[3:]),
            directory,
            "20 distinct assets",
        )
        for asset in assets:
            path = directory / asset["fileName"]
            image = fitz.Pixmap(path)
            require(
                hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"],
                path,
                "SHA-256",
            )
            require(path.stat().st_size == asset["bytes"], path, "byte count")
            require(
                (image.width, image.height) == (asset["width"], asset["height"]),
                path,
                "manifest dimensions",
            )
        require(
            sum(a["bytes"] for a in assets) == manifest["totalBytes"],
            directory,
            "total bytes",
        )
    if group.directory == INTEGRATION:
        manifest = json.loads((directory / "manifest.json").read_text())
        require(
            set(manifest) == set(INTEGRATION_FILES[:6]), directory, "image manifest"
        )
        for name, size in manifest.items():
            require(
                (directory / name).stat().st_size == size,
                directory / name,
                "byte count",
            )


def prepare(
    mode: str = "full",
    *,
    skip_large: bool = False,
    download_ocr: bool = False,
    root: Path = ROOT,
) -> dict[str, int]:
    created = 0
    checked = 0
    staging_parent = root / "data/output/qa-assets"
    staging_parent.mkdir(parents=True, exist_ok=True)
    for group in groups(mode, skip_large):
        directory = root / group.directory
        # Validate existing inputs before generation; corrupt inputs are never replaced.
        for name in group.names:
            if (directory / name).exists():
                validate_file(directory / name)
        missing = [name for name in group.names if not (directory / name).exists()]
        if missing:
            directory.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(
                prefix="staging-", dir=staging_parent
            ) as temp:
                staging = Path(temp)
                command = [
                    sys.executable,
                    "-m",
                    f"scripts.{group.generator}",
                    "--output-dir",
                    str(staging),
                    *group.arguments,
                ]
                if group.directory == INTEGRATION:
                    command += [
                        "--source-scan",
                        str(root / SMALL / "conversion-scan.pdf"),
                    ]
                generated = subprocess.run(
                    command, cwd=ROOT, capture_output=True, text=True
                )
                if generated.returncode:
                    raise RuntimeError(
                        f"{group.generator} failed: {generated.stderr.strip()}"
                    )
                validate_group(staging, group)
                # Validate the prospective complete group before installing missing files.
                for name in group.names:
                    if name not in missing:
                        shutil.copyfile(directory / name, staging / name)
                validate_group(staging, group)
                for name in missing:
                    shutil.copyfile(staging / name, directory / name)
                created += len(missing)
        validate_group(directory, group)
        checked += len(group.names)
    if mode in ("backend", "full"):
        ocr = importlib.import_module("scripts.prepare-ocr-resources")
        ocr.prepare(
            download=download_ocr, destination=root / "services/pdf-engine/build/ocr"
        )
    return {"created": created, "validated": checked}


def clean(root: Path = ROOT) -> int:
    """Only generated asset filenames; retain tracked references, outputs and OCR cache."""
    removed = 0
    for directory, names in (
        (INTEGRATION, INTEGRATION_FILES),
        (ROBUSTNESS, ROBUSTNESS_FILES),
        (SMALL, ("pdf-large.pdf",)),
    ):
        for name in names:
            path = root / directory / name
            if path.is_file():
                path.unlink()
                removed += 1
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode", choices=("browser", "backend", "full"), default="full"
    )
    parser.add_argument("--skip-large", action="store_true")
    parser.add_argument(
        "--download-ocr",
        action="store_true",
        help="Allow pinned official tessdata downloads (60s timeout, SHA-256).",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove only regenerable ignored QA assets, then exit.",
    )
    args = parser.parse_args()
    try:
        result = (
            {"removed": clean()}
            if args.clean
            else prepare(
                args.mode, skip_large=args.skip_large, download_ocr=args.download_ocr
            )
        )
    except (
        ValueError,
        RuntimeError,
        OSError,
        KeyError,
        subprocess.CalledProcessError,
        TypeError,
        IndexError,
    ) as error:
        print(f"QA preparation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

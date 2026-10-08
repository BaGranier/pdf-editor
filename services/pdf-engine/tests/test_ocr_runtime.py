from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

import fitz
import pytest
from pypdf import PdfReader

from app import ocr, ocr_runtime, ocr_worker

ROOT = Path(__file__).resolve().parents[3]
RUNTIME = Path(__file__).resolve().parents[1] / "build/ocr"


def test_frozen_runtime_is_relative_to_extraction_not_system_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    root = tmp_path / "été avec espaces"
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(root), raising=False)
    monkeypatch.setenv("PDF_ENGINE_OCR_RUNTIME", "C:/Program Files/Tesseract-OCR")
    assert ocr_runtime.bundled_runtime() == root / "ocr"
    command = ocr.build_ocr_command(
        root / "scan.pdf",
        root / "out.pdf",
        languages="fra",
        mode="force-ocr",
        deskew=False,
        jobs=1,
    )
    assert command[:2] == [sys.executable, "--ocr-worker"]
    assert "ocrmypdf" not in command
    with pytest.raises(ocr.OcrError) as error:
        asyncio.run(ocr.get_installed_languages())
    assert error.value.code == "OCR_TOOL_UNAVAILABLE"


def test_corruption_and_missing_language_are_controlled(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    (tmp_path / "tessdata").mkdir()
    binary = b"synthetic test"
    (tmp_path / "tessdata/eng.traineddata").write_bytes(binary)
    (tmp_path / "manifest.json").write_text(
        json.dumps(
            {
                "files": {
                    "eng.traineddata": {"sha256": hashlib.sha256(binary).hexdigest()},
                    "fra.traineddata": {"sha256": "missing"},
                }
            }
        )
    )
    monkeypatch.setenv("PDF_ENGINE_OCR_RUNTIME", str(tmp_path))
    assert asyncio.run(ocr.get_installed_languages()) == {"eng"}
    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_languages_available(["fra"], {"eng"})
    assert error.value.code == "OCR_LANGUAGE_UNAVAILABLE"
    (tmp_path / "tessdata/eng.traineddata").write_bytes(b"corrupt")
    with pytest.raises(ocr.OcrError) as error:
        asyncio.run(ocr.get_installed_languages())
    assert error.value.code == "OCR_TOOL_UNAVAILABLE"


@pytest.mark.integration
@pytest.mark.parametrize(
    "language,fixture,witness",
    [
        ("eng", "conversion-scan.pdf", "SCANNED OCR WITNESS"),
        ("fra", "conversion-scan-french.pdf", "français"),
    ],
)
def test_integrated_ocr_without_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    language: str,
    fixture: str,
    witness: str,
) -> None:
    if not (RUNTIME / "manifest.json").is_file():
        pytest.skip("Run scripts.prepare-ocr-resources before bundled OCR QA")
    monkeypatch.setenv("PATH", "")
    source = ROOT / "apps/web/e2e/fixtures" / fixture
    before = source.read_bytes()
    output = tmp_path / "été searchable.pdf"
    ocr_worker.run_worker(source, output, RUNTIME, language, "force-ocr")
    with fitz.open(output) as doc:
        text = " ".join(page.get_text() for page in doc)
        assert witness.casefold() in text.casefold(), text
        assert doc[0].get_images()
    assert source.read_bytes() == before


def test_page_memory_guard_before_pixmap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ocr_worker, "validate_runtime", lambda *args: {"eng"})
    source = tmp_path / "large.pdf"
    with fitz.open() as doc:
        doc.new_page(width=20000, height=20000)
        doc.save(source)
    with pytest.raises(ValueError, match="dimensions"):
        ocr_worker.run_worker(
            source, tmp_path / "output.pdf", tmp_path, "eng", "force-ocr"
        )
    assert not (tmp_path / "output.pdf").exists()


@pytest.mark.integration
def test_repeated_scans_keep_distinct_pages_in_strict_reader(tmp_path: Path) -> None:
    if not (RUNTIME / "manifest.json").is_file():
        pytest.skip("Run scripts.prepare-ocr-resources before bundled OCR QA")
    source = tmp_path / "repeated.pdf"
    with (
        fitz.open(ROOT / "apps/web/e2e/fixtures/conversion-scan.pdf") as scan,
        fitz.open() as doc,
    ):
        for _ in range(5):
            doc.insert_pdf(scan)
        doc[4].set_rotation(90)
        doc.save(source, garbage=2)
    destination = tmp_path / "searchable.pdf"
    ocr_worker.run_worker(source, destination, RUNTIME, "eng", "force-ocr")
    reader = PdfReader(destination, strict=True)
    assert len(reader.pages) == 5
    assert len({page.indirect_reference.idnum for page in reader.pages}) == 5
    assert all("SCANNED OCR WITNESS" in page.extract_text() for page in reader.pages)
    assert reader.pages[4].rotation == 90

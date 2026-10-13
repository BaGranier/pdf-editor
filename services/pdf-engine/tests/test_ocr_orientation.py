import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path

import fitz
import pytest
from pypdf import PdfReader
from app.ocr_orientation import rotate_scan
from app.ocr_worker import run_worker

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "apps/web/e2e/fixtures"
RUNTIME = Path(__file__).resolve().parents[1] / "build/ocr"


def check_output(source, output):
    with fitz.open(output) as document, fitz.open(source) as original:
        assert len(document) == len(original)
        for page in document:
            text = " ".join(page.get_text().split())
            assert "ORIENTATION WITNESS" in text, text
            assert "été" in text and "café" in text, text
            assert "quick brown fox" in text, text
            assert text.lower().index("reading order first") < text.lower().index(
                "reading order second"
            ), text
            assert tuple(page.rect)[2:] == pytest.approx((500, 650), abs=1)
        assert len(PdfReader(output, strict=True).pages) == len(document)


@pytest.mark.integration
@pytest.mark.parametrize(
    "name,correction",
    [
        ("0", 0),
        ("90", 270),
        ("180", 180),
        ("270", 90),
        ("skew-positive", 0),
        ("skew-negative", 0),
        ("contrast", 0),
        ("multipage", 0),
    ],
)
def test_bundled_corpus(tmp_path, name, correction):
    if not (RUNTIME / "manifest.json").exists():
        pytest.skip("Prepared OCR runtime required")
    source = FIXTURES / f"ocr-oriented-{name}.pdf"
    before = hashlib.sha256(source.read_bytes()).digest()
    oriented, output = tmp_path / "oriented.pdf", tmp_path / "output.pdf"
    started = time.perf_counter()
    if correction:
        rotate_scan(source, oriented, correction)
    run_worker(
        oriented if correction else source, output, RUNTIME, "fra+eng", "force-ocr"
    )
    check_output(source, output)
    assert hashlib.sha256(source.read_bytes()).digest() == before
    print(
        json.dumps(
            {
                "runtime": "MuPDF",
                "case": name,
                "seconds": round(time.perf_counter() - started, 3),
                "bytes": output.stat().st_size,
            }
        )
    )


@pytest.mark.integration
@pytest.mark.parametrize("name", ["0", "skew-positive", "skew-negative", "multipage"])
@pytest.mark.parametrize("deskew", [False, True])
def test_system_deskew_measurement(tmp_path, name, deskew):
    if not shutil.which("ocrmypdf"):
        pytest.skip("OCRmyPDF required")
    source = FIXTURES / f"ocr-oriented-{name}.pdf"
    before = source.read_bytes()
    output = tmp_path / "system.pdf"
    command = [
        "ocrmypdf",
        "--force-ocr",
        "--output-type",
        "pdf",
        "--optimize",
        "0",
        "--fast-web-view",
        "1000000000",
        "--jobs",
        "1",
        "-l",
        "fra+eng",
    ]
    if deskew:
        command.append("--deskew")
    started = time.perf_counter()
    subprocess.run(
        [*command, str(source), str(output)],
        check=True,
        capture_output=True,
        timeout=120,
    )
    check_output(source, output)
    assert source.read_bytes() == before
    print(
        json.dumps(
            {
                "runtime": "OCRmyPDF",
                "case": name,
                "deskew": deskew,
                "seconds": round(time.perf_counter() - started, 3),
                "bytes": output.stat().st_size,
            }
        )
    )


@pytest.mark.integration
@pytest.mark.parametrize("angle,correction", [(90, 270), (180, 180), (270, 90)])
def test_rotation_before_after(tmp_path, angle, correction):
    if not (RUNTIME / "manifest.json").exists():
        pytest.skip("Prepared OCR runtime required")
    source = FIXTURES / f"ocr-oriented-{angle}.pdf"
    oriented = tmp_path / "oriented.pdf"
    for corrected in [False, True]:
        output = tmp_path / f"rotation-{corrected}.pdf"
        started = time.perf_counter()
        if corrected:
            rotate_scan(source, oriented, correction)
        run_worker(
            oriented if corrected else source, output, RUNTIME, "fra+eng", "force-ocr"
        )
        with fitz.open(output) as document:
            text = " ".join(document[0].get_text().split())
        witness = "ORIENTATION WITNESS" in text
        if corrected:
            assert witness
        print(
            json.dumps(
                {
                    "rotation": angle,
                    "corrected": corrected,
                    "witness": witness,
                    "accents": {
                        word: word in text
                        for word in [
                            "français",
                            "été",
                            "déjà",
                            "élève",
                            "école",
                            "café",
                        ]
                    },
                    "seconds": round(time.perf_counter() - started, 3),
                    "bytes": output.stat().st_size,
                }
            )
        )


@pytest.mark.integration
def test_bundled_orientation_through_supervised_route(tmp_path, monkeypatch):
    import asyncio
    import io
    from fastapi import UploadFile
    from app import ocr

    if not (RUNTIME / "manifest.json").exists():
        pytest.skip("Prepared OCR runtime required")
    monkeypatch.setenv("PDF_ENGINE_OCR_RUNTIME", str(RUNTIME))
    monkeypatch.setenv("PATH", "")
    monkeypatch.chdir(Path(__file__).resolve().parents[1])
    temporary = tmp_path / "ocr"
    temporary.mkdir()
    monkeypatch.setattr(ocr, "create_temporary_directory", lambda: temporary)
    source = (FIXTURES / "ocr-oriented-90.pdf").read_bytes()

    async def process():
        response = await ocr.ocr_pdf(
            file=UploadFile(file=io.BytesIO(source), filename="scan.pdf"),
            languages="fra+eng",
            deskew=False,
            rotation=270,
        )
        check_output(FIXTURES / "ocr-oriented-90.pdf", Path(response.path))
        assert (temporary / "input.pdf").read_bytes() == source
        await response.background()

    asyncio.run(process())
    assert not temporary.exists()
    assert (FIXTURES / "ocr-oriented-90.pdf").read_bytes() == source

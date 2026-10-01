"""Validate only the synthetic artifacts produced by the native Windows QA driver."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import fitz
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "output" / "windows-qa-002"


def validate() -> dict[str, object]:
    txt = (OUTPUT / "reports" / "contrat été-0.txt").read_text(encoding="utf-8")
    for word in ["numérique", "français", "été", "élève", "Noël"]:
        if word not in txt:
            raise ValueError(f"TXT witness missing: {word}")
    docx = Document(OUTPUT / "reports" / "contrat été-0.docx")
    text = "\n".join(paragraph.text for paragraph in docx.paragraphs)
    if "Conversion locale PDF" not in text or "été" not in text:
        raise ValueError("DOCX text witness missing")
    images = []
    with zipfile.ZipFile(OUTPUT / "reports" / "contrat été-0.zip") as archive:
        for name in archive.namelist():
            if not name.lower().endswith(".png"):
                raise ValueError("Unexpected image archive member")
            data = archive.read(name)
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError("Invalid PNG signature")
            pixmap = fitz.Pixmap(data)
            if pixmap.width <= 0 or pixmap.height <= pixmap.width:
                raise ValueError("Unexpected portrait image dimensions")
            images.append(
                {"name": name, "width": pixmap.width, "height": pixmap.height}
            )
    if len(images) != 2:
        raise ValueError("Expected two PNG pages")
    ocr = {}
    for language, witnesses in {
        "eng": ["SCANNED OCR WITNESS"],
        "fra": ["Évaluation", "française", "caractères", "détectés"],
    }.items():
        with fitz.open(OUTPUT / "ocr" / f"{language}.pdf") as document:
            text = "".join(page.get_text() for page in document)
            if len(document) != 1 or not all(word in text for word in witnesses):
                raise ValueError(f"OCR {language} witness missing")
            ocr[language] = {"pages": len(document), "witnesses": witnesses}
    source = ROOT / "apps" / "web" / "e2e" / "fixtures" / "conversion-scan-french.pdf"
    with fitz.open(source) as document:
        if any(page.get_text() for page in document):
            raise ValueError("French scan source contains digital text")
    with fitz.open(OUTPUT / "contrat été (copie) [1].PDF") as document:
        text = " ".join("".join(page.get_text() for page in document).split())
        if "Overwrite Windows été 002" not in text:
            raise ValueError("Native overwrite text witness missing")
    return {
        "status": "OK",
        "scope": "structure and synthetic witnesses, not visual DOCX",
        "pngPages": images,
        "ocr": ocr,
    }


def main() -> int:
    try:
        report = validate()
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        report = {"status": "KO", "message": str(error)}
    destination = OUTPUT / "reports" / "artifact-validation.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(report, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=True))
    return 0 if report["status"] == "OK" else 1


if __name__ == "__main__":
    raise SystemExit(main())

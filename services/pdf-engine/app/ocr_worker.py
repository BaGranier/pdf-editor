"""Bounded, process-isolated OCR using the already packaged MuPDF/Tesseract engine."""

from __future__ import annotations

import argparse
from pathlib import Path

import fitz

from app.ocr_runtime import validate_runtime

OCR_DPI = 200
MAX_PAGE_PIXELS = 40_000_000  # RGB + OCR buffers; reject before allocating.


def run_worker(
    source: Path, destination: Path, runtime: Path, languages: str, mode: str
) -> None:
    validate_runtime(runtime, languages.split("+"))
    with fitz.open(source) as original, fitz.open() as result:
        for page in original:
            if mode == "skip-text" and page.get_text().strip():
                result.insert_pdf(original, from_page=page.number, to_page=page.number)
                continue
            scale = OCR_DPI / 72
            if page.rect.width * scale * page.rect.height * scale > MAX_PAGE_PIXELS:
                raise ValueError(
                    "La page dépasse les dimensions autorisées pour l’OCR."
                )
            # OCR the source coordinate system, then restore the PDF rotation.
            # Rendering a /Rotate=90 page first would feed sideways glyphs to OCR.
            rotation = page.rotation
            page.set_rotation(0)
            try:
                pixmap = page.get_pixmap(dpi=OCR_DPI, colorspace=fitz.csRGB, alpha=False)
            finally:
                page.set_rotation(rotation)
            data = pixmap.pdfocr_tobytes(
                language=languages, tessdata=str(runtime / "tessdata")
            )
            with fitz.open(stream=data, filetype="pdf") as searchable:
                searchable[0].set_rotation(rotation)
                result.insert_pdf(searchable)
            del pixmap, data
        result.set_metadata(original.metadata)
        # Do not merge identical page dictionaries: repeated scans must keep
        # distinct /Page identities, otherwise strict readers reject the tree.
        result.save(destination, garbage=2, deflate=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", type=Path, required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--mode", choices=("force-ocr", "skip-text"), required=True)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    options = parser.parse_args()
    run_worker(
        options.input, options.output, options.runtime, options.language, options.mode
    )


if __name__ == "__main__":
    main()

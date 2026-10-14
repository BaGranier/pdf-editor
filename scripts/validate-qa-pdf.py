#!/usr/bin/env python3
"""Validate an exported QA PDF and print machine-readable metadata."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import fitz
from pypdf import PdfReader


def validate_structure(pdf: Path, expected_pages: int | None = None) -> PdfReader:
    """Shared strict reader for generated inputs and exported QA outputs."""
    reader = PdfReader(pdf, strict=True)
    if expected_pages is not None and len(reader.pages) != expected_pages:
        page_count = len(reader.pages)
        reader.close()
        raise ValueError(
            f"Nombre de pages inattendu: {page_count} != {expected_pages}"
        )
    return reader


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--expected-pages", type=int)
    args = parser.parse_args()

    try:
        reader = validate_structure(args.pdf, args.expected_pages)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    with fitz.open(args.pdf) as fitz_document:
        image_count = sum(len(page.get_images(full=True)) for page in fitz_document)
        drawing_count = sum(len(page.get_drawings()) for page in fitz_document)
        text_spans = [
            {
                "page": page_index + 1,
                "text": span["text"],
                "bbox": span["bbox"],
                "font": span["font"],
                "size": span["size"],
            }
            for page_index, page in enumerate(fitz_document)
            for block in page.get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
        ]

    result = {
        "valid": True,
        "pageCount": len(reader.pages),
        "imageCount": image_count,
        "drawingCount": drawing_count,
        "text": "\n".join(page.extract_text() or "" for page in reader.pages),
        "textSpans": text_spans,
        "pages": [
            {
                "width": int(page.mediabox.width),
                "height": int(page.mediabox.height),
                "rotation": int(page.rotation),
            }
            for page in reader.pages
        ],
    }
    print(json.dumps(result))


if __name__ == "__main__":
    main()

"""Explicit clockwise correction of scanned pixels, without system binaries."""

from pathlib import Path

import fitz


def rotate_scan(source: Path, destination: Path, clockwise: int) -> None:
    with fitz.open(source) as original, fitz.open() as result:
        for page in original:
            width, height = page.rect.width, page.rect.height
            if clockwise in (90, 270):
                width, height = height, width
            target = result.new_page(width=width, height=height)
            if page.get_contents():
                target.show_pdf_page(
                    target.rect, original, page.number, rotate=-clockwise
                )
        result.set_metadata(original.metadata)
        result.save(destination, garbage=2, deflate=True)

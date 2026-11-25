"""Extract positioned text for redaction without modifying the source PDF."""

from __future__ import annotations

import tempfile
import unicodedata
from pathlib import Path

import fitz

from app.ocr import (
    TESSERACT_TIMEOUT_SECONDS,
    build_ocr_command,
    capture_process,
    get_installed_languages,
)
from app.ocr_runtime import bundled_runtime
from app.ocr_worker import MAX_PAGE_PIXELS, OCR_DPI


def text_lines(
    page: fitz.Page, *, scale: float = 1, transform: fitz.Matrix | None = None
) -> list[list[tuple[str, list[float]]]]:
    inverse = transform if transform is not None else ~page.transformation_matrix
    raw = page.get_text(
        "rawdict", flags=fitz.TEXTFLAGS_RAWDICT & ~fitz.TEXT_PRESERVE_IMAGES, sort=True
    )
    lines = []
    for block in raw["blocks"]:
        for line in block.get("lines", []):
            chars = []
            for span in line["spans"]:
                for char in span["chars"]:
                    box = fitz.Rect(char["bbox"]) & page.rect
                    if not box.is_empty:
                        box = fitz.Rect(*(value * scale for value in box)) * inverse
                        chars.append((char["c"], list(box)))
            if chars:
                lines.append(chars)
    return lines


def without_text_overlap(recognized, native):
    """Keep OCR words where no corresponding native or invisible OCR word exists."""

    def words(lines):
        for line in lines:
            word = []
            for glyph in line:
                if glyph[0].isspace():
                    if word:
                        yield word
                        word = []
                else:
                    word.append(glyph)
            if word:
                yield word

    def describe(word):
        box = fitz.Rect(word[0][1])
        for _, rect in word[1:]:
            box |= fitz.Rect(rect)
        token = unicodedata.normalize(
            "NFKC", "".join(glyph[0] for glyph in word)
        ).casefold()
        return token, box

    # Spatial buckets keep dense text pages from doing a quadratic glyph scan.
    bins: dict[int, list[tuple[str, fitz.Rect]]] = {}
    for word in words(native):
        token, box = describe(word)
        for bucket in range(int(box.y0 // 32), int(box.y1 // 32) + 1):
            bins.setdefault(bucket, []).append((token, box))

    result = []
    for line in recognized:
        run = []
        for word in words([line]):
            token, box = describe(word)
            if any(
                (box & candidate).get_area()
                >= box.get_area() * (0.40 if token == other else 0.80)
                for bucket in range(int(box.y0 // 32), int(box.y1 // 32) + 1)
                for other, candidate in bins.get(bucket, [])
            ):
                if run:
                    result.append(run)
                    run = []
                continue
            if run:
                run.append((" ", list(box)))
            run.extend(word)
        if run:
            result.append(run)
    return result


async def recognize_page(page: fitz.Page, languages: str):
    scale = OCR_DPI / 72
    if page.rect.get_area() * scale**2 > MAX_PAGE_PIXELS:
        raise ValueError("Page trop grande pour l’OCR.")
    with tempfile.TemporaryDirectory(prefix="pdf-redaction-ocr-") as directory:
        root = Path(directory)
        output = root / "page.pdf"
        if bundled_runtime() is not None:
            source = root / "source.pdf"
            with fitz.open() as isolated:
                isolated.insert_pdf(
                    page.parent,
                    from_page=page.number,
                    to_page=page.number,
                    links=False,
                    annots=False,
                    widgets=False,
                )
                isolated.save(source)
            command = build_ocr_command(
                source,
                output,
                languages=languages,
                mode="force-ocr",
                deskew=False,
                jobs=1,
            )
        else:
            source = root / "page.png"
            page.get_pixmap(dpi=OCR_DPI, colorspace=fitz.csRGB, annots=False).save(
                source
            )
            command = [
                "tesseract",
                str(source),
                str(output.with_suffix("")),
                "-l",
                languages,
                "--dpi",
                str(OCR_DPI),
                "pdf",
            ]
        code, _, _ = await capture_process(
            command, timeout_seconds=TESSERACT_TIMEOUT_SECONDS
        )
        if code != 0 or not output.is_file():
            raise ValueError("Reconnaissance OCR impossible.")
        with fitz.open(output) as recognized:
            ocr_page = recognized[0]
            # The worker raster rounds page dimensions to integer pixels. OCR's
            # PDF uses the same requested DPI and top-left origin as the render.
            return text_lines(ocr_page, transform=~page.transformation_matrix)


async def redaction_languages() -> str:
    available = await get_installed_languages()
    selected = [language for language in ("fra", "eng") if language in available]
    if not selected:
        raise ValueError("Installez les langues OCR française ou anglaise.")
    return "+".join(selected)

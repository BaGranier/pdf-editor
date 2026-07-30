from __future__ import annotations

import re
from pathlib import Path

import fitz

from app.conversion.errors import ConversionError
from app.conversion.models import TextLayerReport


MIN_EXPLOITABLE_CHARACTERS = 8


def _has_exploitable_text(page: fitz.Page) -> bool:
    text = page.get_text("text", sort=True)
    normalized = re.sub(r"\s+", "", text)
    return sum(character.isalnum() for character in normalized) >= (
        MIN_EXPLOITABLE_CHARACTERS
    )


def detect_text_layer(
    input_pdf: Path,
    page_indexes: list[int],
) -> TextLayerReport:
    exploitable_pages: list[int] = []
    image_only_pages: list[int] = []
    try:
        with fitz.open(input_pdf) as document:
            for page_index in page_indexes:
                if _has_exploitable_text(document[page_index]):
                    exploitable_pages.append(page_index + 1)
                else:
                    image_only_pages.append(page_index + 1)
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise ConversionError(
            status_code=400,
            code="INVALID_PDF",
            message="Le fichier fourni n'est pas un PDF valide.",
        ) from error

    if exploitable_pages and image_only_pages:
        classification = "mixed"
    elif exploitable_pages:
        classification = "digital"
    else:
        classification = "scanned"
    return TextLayerReport(
        classification=classification,
        exploitable_pages=exploitable_pages,
        image_only_pages=image_only_pages,
    )

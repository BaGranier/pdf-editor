"""PDF-point pattern plane. Equations mirror watermarkTiling.ts; never store occurrences."""

import math

import fitz
from fastapi import HTTPException

from app.stamp_font_metrics import measured_glyphs


def layout_watermark_tiles(
    text: str,
    font: fitz.Font,
    width: float,
    height: float,
    size: float,
    rotation: float,
    horizontal_gap: float = 48,
    vertical_gap: float = 64,
    offset_x: float = 0,
    offset_y: float = 0,
) -> tuple[int, list[tuple[str, float, float]]]:
    glyphs = measured_glyphs(font, {ord(char) for char in text if char != "\n"})
    measured = []
    top, bottom = math.inf, -math.inf
    for index, line in enumerate(text.split("\n")):
        advance, left, right = 0.0, math.inf, -math.inf
        for char in line:
            if ord(char) not in glyphs:
                raise HTTPException(422, "Caractère du filigrane absent de la police.")
            step, a, b, c, d = glyphs[ord(char)]
            if char != " ":
                left, right = min(left, advance + a), max(right, advance + c)
                top, bottom = min(top, index * 1.4 - d), max(bottom, index * 1.4 - b)
            advance += step
        measured.append(
            (
                line,
                advance,
                left if math.isfinite(left) else 0,
                right if math.isfinite(right) else 0,
            )
        )
    if not math.isfinite(top):
        raise HTTPException(422, "Saisissez un texte de filigrane.")
    ink_width = (
        max(max(advance, right - left) for _, advance, left, right in measured) * size
    )
    ink_height = (bottom - top) * size
    step_x, step_y = ink_width + horizontal_gap, ink_height + vertical_gap
    angle = math.radians(rotation)
    span_x = abs(math.cos(angle)) * width + abs(math.sin(angle)) * height
    span_y = abs(math.sin(angle)) * width + abs(math.cos(angle)) * height
    first_x = math.floor((-span_x / 2 - ink_width / 2 - offset_x) / step_x)
    last_x = math.ceil((span_x / 2 + ink_width / 2 - offset_x) / step_x)
    first_y = math.floor((-span_y / 2 - ink_height / 2 - offset_y) / step_y)
    last_y = math.ceil((span_y / 2 + ink_height / 2 - offset_y) / step_y)
    count = (last_x - first_x + 1) * (last_y - first_y + 1)
    if count > 800 or count * len(measured) > 2400 or count * len(text) > 60000:
        raise HTTPException(
            422,
            "Motif trop dense (maximum 800 répétitions, 2 400 lignes ou 60 000 caractères par page). Augmentez les espacements ou la taille.",
        )
    lines = []
    for row in range(first_y, last_y + 1):
        for col in range(first_x, last_x + 1):
            cx = width / 2 + offset_x + col * step_x
            cy = height / 2 + offset_y + row * step_y
            for index, (line, _, left, right) in enumerate(measured):
                lines.append(
                    (
                        line,
                        cx - (left + right) / 2 * size,
                        cy - (top + bottom) / 2 * size + index * 1.4 * size,
                    )
                )
    return count, lines

"""Layout from actual font ink bounds; browser metrics are generated from these fonts."""

import math
import fitz
from fastapi import HTTPException


def layout_stamp(
    text: str,
    font: fitz.Font,
    width: float,
    height: float,
    font_size: float,
    mode: str,
    padding_ratio: float,
    border_width: float,
    align: str,
) -> tuple[float, list[tuple[str, float, float]]]:
    lines = []
    for index, line in enumerate(text.split("\n")):
        advance, x0, y0, x1, y1 = 0.0, math.inf, math.inf, -math.inf, -math.inf
        for char in line:
            if not font.has_glyph(ord(char)):
                raise HTTPException(422, "Caractère du marquage absent de la police.")
            box = font.glyph_bbox(ord(char))
            if char != " ":
                x0, x1 = min(x0, advance + box.x0), max(x1, advance + box.x1)
                y0, y1 = min(y0, index * 1.4 - box.y1), max(y1, index * 1.4 - box.y0)
            advance += font.glyph_advance(ord(char))
        lines.append(
            (
                line,
                x0 if math.isfinite(x0) else 0,
                x1 if math.isfinite(x1) else 0,
                y0,
                y1,
            )
        )
    ink_width = max(0.001, *(line[2] - line[1] for line in lines))
    top, bottom = min(line[3] for line in lines), max(line[4] for line in lines)
    ink_height = max(0.001, bottom - top)
    padding = min(width, height) * padding_ratio + border_width / 2
    if mode == "fit":
        font_size = min(
            1000, (width - 2 * padding) / ink_width, (height - 2 * padding) / ink_height
        )
    if (
        not math.isfinite(top)
        or font_size <= 0
        or ink_width * font_size > width - 2 * padding + 0.01
        or ink_height * font_size > height - 2 * padding + 0.01
    ):
        raise HTTPException(
            422,
            "Le texte du marquage dépasse son cadre. Activez Taille automatique ou agrandissez le cadre.",
        )
    baseline = height / 2 - (top + bottom) / 2 * font_size
    return font_size, [
        (
            line,
            padding - x0 * font_size
            if align == "left"
            else width - padding - x1 * font_size
            if align == "right"
            else width / 2 - (x0 + x1) / 2 * font_size,
            baseline + i * 1.4 * font_size,
        )
        for i, (line, x0, x1, _, _) in enumerate(lines)
    ]

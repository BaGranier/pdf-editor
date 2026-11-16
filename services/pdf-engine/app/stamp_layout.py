"""Layout from actual font ink bounds; browser metrics are generated from these fonts."""

import math
import fitz
from fastapi import HTTPException
from app.stamp_font_metrics import measured_glyphs


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
    rotation: float = 0,
    scale: float = 1,
    offset_x: float = 0,
    offset_y: float = 0,
    watermark: bool = False,
) -> tuple[float, list[tuple[str, float, float]]]:
    glyphs = measured_glyphs(font, {ord(char) for char in text if char != "\n"})
    lines = []
    for index, line in enumerate(text.split("\n")):
        advance, x0, y0, x1, y1 = 0.0, math.inf, math.inf, -math.inf, -math.inf
        for char in line:
            if ord(char) not in glyphs:
                raise HTTPException(422, "Caractère du marquage absent de la police.")
            step, *bounds = glyphs[ord(char)]
            box = fitz.Rect(bounds)
            if char != " ":
                x0, x1 = min(x0, advance + box.x0), max(x1, advance + box.x1)
                y0, y1 = min(y0, index * 1.4 - box.y1), max(y1, index * 1.4 - box.y0)
            advance += step
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
    cx, cy = width * (0.5 + offset_x), height * (0.5 + offset_y)
    cosine, sine = (
        abs(math.cos(math.radians(rotation))),
        abs(math.sin(math.radians(rotation))),
    )
    box_width = ink_width * cosine + ink_height * sine if watermark else ink_width
    box_height = ink_width * sine + ink_height * cosine if watermark else ink_height
    available_width, available_height = (
        2 * min(cx - padding, width - padding - cx),
        2 * min(cy - padding, height - padding - cy),
    )
    if mode == "fit":
        font_size = min(
            1000,
            available_width / box_width * scale,
            available_height / box_height * scale,
        )
    if (
        not math.isfinite(top)
        or font_size <= 0
        or box_width * font_size > available_width + 0.01
        or box_height * font_size > available_height + 0.01
    ):
        raise HTTPException(
            422,
            "Le texte du marquage dépasse son cadre. Activez Taille automatique ou agrandissez le cadre.",
        )
    baseline = cy - (top + bottom) / 2 * font_size
    return font_size, [
        (
            line,
            padding - x0 * font_size
            if align == "left"
            else width - padding - x1 * font_size
            if align == "right"
            else cx - (x0 + x1) / 2 * font_size,
            baseline + i * 1.4 * font_size,
        )
        for i, (line, x0, x1, _, _) in enumerate(lines)
    ]

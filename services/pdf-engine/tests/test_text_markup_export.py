from __future__ import annotations

import fitz
import pytest

from app import main


def source_pdf() -> bytes:
    document = fitz.open()
    document.new_page(width=400, height=400)
    source = document.tobytes(garbage=4, deflate=True, no_new_id=True)
    document.close()
    return source


def markup(
    markup_id: str,
    kind: str,
    color: str,
    rects: list[tuple[float, float, float, float]],
) -> dict[str, object]:
    values = [dict(zip(("x0", "y0", "x1", "y1"), rect, strict=True)) for rect in rects]
    return {
        "id": markup_id,
        "type": "text_markup",
        "kind": kind,
        "page": 1,
        "rect": values[0],
        "rects": values,
        "color": color,
    }


def test_exports_orderable_vector_markup_with_color_and_multiple_rects() -> None:
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "textMarkups": [
                markup(
                    "highlight",
                    "highlight",
                    "#eab308",
                    [(30, 40, 140, 60), (30, 70, 180, 90)],
                ),
                markup("underline", "underline", "#2563eb", [(30, 120, 140, 140)]),
                markup("strikeout", "strikeout", "#dc2626", [(30, 170, 140, 190)]),
            ],
        }
    )
    exported = main.export_organized_pdf({"active-document": source_pdf()}, plan)
    with fitz.open(stream=exported, filetype="pdf") as document:
        drawings = document[0].get_drawings()
        assert not list(document[0].annots() or ())
    assert len(drawings) == 4
    assert drawings[0]["fill"] == pytest.approx((0.918, 0.702, 0.031), abs=0.002)
    assert drawings[0]["fill_opacity"] == pytest.approx(0.32)
    assert drawings[2]["color"] == pytest.approx((0.145, 0.388, 0.922), abs=0.002)

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


def test_exports_freehand_width_and_opacity_as_vector_drawing() -> None:
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "freehands": [
                {
                    "id": "freehand-1",
                    "type": "freehand",
                    "page": 1,
                    "rect": {"x0": 40, "y0": 40, "x1": 180, "y1": 160},
                    "points": [
                        {"x": 40, "y": 40},
                        {"x": 100, "y": 130},
                        {"x": 180, "y": 160},
                    ],
                    "style": {"color": "#2563eb", "strokeWidth": 6, "opacity": 0.35},
                }
            ],
        }
    )

    exported = main.export_organized_pdf({"active-document": source_pdf()}, plan)

    with fitz.open(stream=exported, filetype="pdf") as document:
        drawings = document[0].get_drawings()

    assert len(drawings) == 1
    assert drawings[0]["width"] == 6
    assert drawings[0]["stroke_opacity"] == pytest.approx(0.35)
    assert drawings[0]["color"] == pytest.approx((37 / 255, 99 / 255, 235 / 255))


def test_freehand_opacity_defaults_to_one_for_existing_payloads() -> None:
    style = main.FreehandStyle.model_validate({"color": "#2563eb", "strokeWidth": 3})

    assert style.opacity == 1

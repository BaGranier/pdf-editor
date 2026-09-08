from __future__ import annotations

import fitz
import pytest
from pydantic import ValidationError

from app import main


def source_pdf() -> bytes:
    document = fitz.open()
    document.new_page(width=400, height=400)
    source = document.tobytes(garbage=4, deflate=True, no_new_id=True)
    document.close()
    return source


def shape_payload(
    shape_id: str,
    shape_type: str,
    rect: tuple[float, float, float, float],
    *,
    stroke: str,
    width: float,
    fill: str | None,
    opacity: float | None = None,
) -> dict[str, object]:
    return {
        "id": shape_id,
        "type": "shape",
        "shapeType": shape_type,
        "page": 1,
        "rect": dict(zip(("x0", "y0", "x1", "y1"), rect, strict=True)),
        "style": {
            "strokeColor": stroke,
            "strokeWidth": width,
            "fillColor": fill,
            **({"opacity": opacity} if opacity is not None else {}),
        },
    }


def test_exports_rectangle_ellipse_and_line_as_pdf_drawings() -> None:
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "shapes": [
                shape_payload(
                    "rectangle",
                    "rectangle",
                    (40, 260, 160, 350),
                    stroke="#ff0000",
                    width=3,
                    fill="#00ff00",
                ),
                shape_payload(
                    "ellipse",
                    "ellipse",
                    (190, 260, 310, 350),
                    stroke="#0000ff",
                    width=2,
                    fill=None,
                ),
                shape_payload(
                    "line",
                    "line",
                    (50, 80, 300, 200),
                    stroke="#112233",
                    width=4,
                    fill="#ffffff",
                ),
            ],
        }
    )

    exported = main.export_organized_pdf({"active-document": source_pdf()}, plan)

    with fitz.open(stream=exported, filetype="pdf") as document:
        drawings = document[0].get_drawings()
        pixmap = document[0].get_pixmap(alpha=False)

    assert len(drawings) == 3
    assert sorted(round(drawing["width"], 2) for drawing in drawings) == [2, 3, 4]
    assert sum(drawing["fill"] is not None for drawing in drawings) == 1
    assert pixmap.samples


def test_exports_shape_opacity_for_stroke_fill_and_transparent_fill() -> None:
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "shapes": [
                shape_payload("rectangle", "rectangle", (30, 30, 120, 100), stroke="#ff0000", width=6, fill="#00ff00", opacity=0.35),
                shape_payload("ellipse", "ellipse", (150, 30, 240, 100), stroke="#0000ff", width=3, fill="#ffff00", opacity=0.6),
                shape_payload("line", "line", (40, 150, 250, 210), stroke="#112233", width=4, fill=None, opacity=0.25),
                shape_payload("transparent", "rectangle", (270, 30, 360, 100), stroke="#7c3aed", width=2, fill=None, opacity=0.4),
            ],
        }
    )

    exported = main.export_organized_pdf({"active-document": source_pdf()}, plan)

    with fitz.open(stream=exported, filetype="pdf") as document:
        drawings = document[0].get_drawings()

    assert len(drawings) == 4
    assert [drawing["stroke_opacity"] for drawing in drawings] == pytest.approx([0.35, 0.6, 0.25, 0.4])
    assert drawings[0]["fill_opacity"] == pytest.approx(0.35)
    assert drawings[1]["fill_opacity"] == pytest.approx(0.6)
    assert drawings[2]["fill"] is None
    assert drawings[3]["fill"] is None


def test_shape_opacity_defaults_to_one_for_existing_payloads() -> None:
    style = main.ShapeStyle.model_validate(
        {"strokeColor": "#2563eb", "strokeWidth": 3, "fillColor": None}
    )

    assert style.opacity == 1


@pytest.mark.parametrize(
    ("property_name", "value"),
    [
        ("strokeColor", "red"),
        ("strokeWidth", 0),
        ("fillColor", "#fff"),
    ],
)
def test_rejects_invalid_shape_styles(property_name: str, value: object) -> None:
    payload = shape_payload(
        "invalid",
        "rectangle",
        (10, 10, 30, 30),
        stroke="#000000",
        width=2,
        fill=None,
    )
    style = payload["style"]
    assert isinstance(style, dict)
    style[property_name] = value

    with pytest.raises(ValidationError):
        main.ShapeEdit.model_validate(payload)

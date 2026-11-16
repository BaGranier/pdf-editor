import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app import main
from test_redaction_search import proof_for, export_resolved
from test_secure_redaction import SECRET, assert_no_secret


def watermark(page=1, width=400, height=600, **extra):
    return {
        "id": f"w-{page}",
        "type": "stamp",
        "purpose": "watermark",
        "layoutVersion": 2,
        "groupId": "group",
        "page": page,
        "rect": {"x0": 0, "y0": 0, "x1": width, "y1": height},
        "text": "CONFIDENTIEL",
        "fontFamily": "Helvetica",
        "fontSizeMode": "fit",
        "fontSize": 72,
        "color": "#b91c1c",
        "rotation": -45,
        "opacity": 0.25,
        "watermarkScale": 0.9,
        "paddingRatio": 0.04,
        "border": False,
        "fillOpacity": 0,
        **extra,
    }


def test_full_page_watermarks_are_vector_printable_and_preserve_originals():
    with fitz.open() as doc:
        marks = []
        for number, (width, height, rotation) in enumerate(
            [(595, 842, 0), (842, 595, 0), (595, 842, 90), (595, 842, 270)]
        ):
            page = doc.new_page(width=width, height=height)
            page.insert_text((40, 100), SECRET)
            page.set_rotation(rotation)
            marks.append(watermark(number + 1, width, height))
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": i} for i in range(4)], "stamps": marks}
    )
    output = main.export_organized_pdf({"source": source}, plan)
    with fitz.open(stream=output, filetype="pdf") as doc:
        for page in doc:
            assert SECRET in page.get_text()
            assert "CONFIDENTIEL" in page.get_text()
            assert not list(page.annots() or [])
            traces = [
                span
                for span in page.get_texttrace()
                if span["opacity"] == pytest.approx(0.25)
            ]
            assert traces
            assert abs(traces[0]["dir"][0]) == pytest.approx(2**-0.5, abs=0.001)
            assert abs(traces[0]["dir"][1]) == pytest.approx(2**-0.5, abs=0.001)
            assert traces[0]["size"] > 50
            assert page.get_pixmap().samples


def test_range_two_to_four_and_combination_with_secure_redaction():
    with fitz.open() as doc:
        matches = []
        for number in range(5):
            page = doc.new_page(width=400, height=600)
            page.insert_text((40, 100), SECRET)
            matches.append(proof_for(doc, number, SECRET))
        source = doc.tobytes()
    marks = [watermark(page, text="BROUILLON") for page in [2, 3, 4]]
    output = export_resolved(source, matches, stamps=marks)
    assert_no_secret(output)
    with fitz.open(stream=output, filetype="pdf") as doc:
        for index, page in enumerate(doc):
            assert ("BROUILLON" in page.get_text()) == (index in [1, 2, 3])


def test_visual_mask_leaves_secret_extractible():
    with fitz.open() as doc:
        doc.new_page(width=400, height=600).insert_text((40, 100), SECRET)
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}],
            "shapes": [
                {
                    "id": "mask",
                    "type": "shape",
                    "visualMask": True,
                    "page": 1,
                    "shapeType": "rectangle",
                    "rect": {"x0": 30, "y0": 480, "x1": 240, "y1": 520},
                    "style": {
                        "strokeColor": "#000000",
                        "fillColor": "#000000",
                        "strokeWidth": 1,
                        "opacity": 1,
                    },
                }
            ],
        }
    )
    output = main.export_organized_pdf({"source": source}, plan)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert SECRET in doc[0].get_text()
        assert doc[0].get_pixmap().pixel(50, 100) == (0, 0, 0)


@pytest.mark.parametrize(
    "patch",
    [
        {"rotation": float("nan")},
        {"offsetX": 1},
        {"watermarkScale": 0},
        {"purpose": "redaction"},
        {"border": True},
        {"fillOpacity": 0.1},
        {"layoutVersion": None},
    ],
)
def test_invalid_watermark_rejected(patch):
    with pytest.raises(ValidationError):
        main.StampEdit.model_validate(watermark(**patch))


def test_manual_watermark_overflow_refused():
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=600)
        edit = main.StampEdit.model_validate(
            watermark(fontSizeMode="manual", fontSize=144, text="X" * 200)
        )
        with pytest.raises(HTTPException):
            main._insert_stamp(page, page.rect, edit, {})

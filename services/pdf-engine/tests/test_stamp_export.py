import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app import main
from test_secure_redaction import assert_no_secret, zone, SECRET


def stamp(**patch):
    return {
        "id": "stamp",
        "type": "stamp",
        "page": 1,
        "rect": {"x0": 30, "y0": 100, "x1": 300, "y1": 190},
        "text": "APPROUVÉ",
        "fontFamily": "Helvetica",
        "fontSize": 20,
        "color": "#b91c1c",
        "opacity": 0.6,
        "rotation": 20,
        "border": True,
        **patch,
    }


def source_pdf(rotation=0):
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_text((40, 110), SECRET)
        page.set_rotation(rotation)
        return doc.tobytes()


def run_export(edits, rotation=0, **extra):
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": 0}], "stamps": edits, **extra}
    )
    return main.export_organized_pdf({"source": source_pdf(rotation)}, plan)


@pytest.mark.parametrize("rotation", [0, 90, 270])
def test_text_stamp_is_printable_vector_content(rotation):
    result = run_export(
        [stamp(text="REÇU\n16/11/2026", createdAt="2026-11-16T00:00:00Z")], rotation
    )
    with fitz.open(stream=result, filetype="pdf") as doc:
        page = doc[0]
        assert "REÇU" in page.get_text()
        assert "16/11/2026" in page.get_text()
        assert not list(page.annots() or [])
        assert any(
            d["stroke_opacity"] == pytest.approx(0.6) for d in page.get_drawings()
        )
        page.set_rotation(0)
        box = page.search_for("REÇU")[0]
        assert fitz.Rect(30, 210, 300, 300).contains(box)
        assert page.get_pixmap().samples


def test_stamp_under_redaction_is_removed_last_including_nested_streams():
    result = run_export(
        [stamp(text=SECRET, rect=zone()["rect"], fontSize=10, rotation=0)],
        redactions=[zone()],
    )
    assert_no_secret(result)


def test_png_stamp_transparency_and_opacity():
    pixels = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 10, 10), True)
    pixels.clear_with(0)
    pixels.set_alpha(bytes(100))
    pixels.set_pixel(5, 5, (255, 0, 0, 255))
    png = pixels.tobytes("png")
    import base64

    result = run_export(
        [stamp(text="", imageId="png", rotation=0, border=False, opacity=0.5)],
        signatureImages=[
            {
                "id": "png",
                "mimeType": "image/png",
                "width": 10,
                "height": 10,
                "dataUrl": "data:image/png;base64," + base64.b64encode(png).decode(),
            }
        ],
    )
    with fitz.open(stream=result, filetype="pdf") as doc:
        image = doc[0].get_images(full=True)[0]
        assert image[1]  # Soft alpha mask embedded in the final PDF.
        mask = fitz.Pixmap(doc, image[1])
        assert mask.pixel(0, 0) == (0,)
        assert mask.pixel(5, 5) == (255,)
        assert b"/ca .5" in b"".join(
            doc.xref_object(x).encode() for x in range(1, doc.xref_length())
        )
        assert not list(doc[0].annots() or [])


@pytest.mark.parametrize(
    "patch",
    [
        {"rotation": float("nan")},
        {"opacity": 2},
        {"fontSize": 0},
        {"text": ""},
        {"color": "red"},
        {"text": "test 😀"},
        {"text": "REÇU € Œ"},
        {"text": "test\x00"},
    ],
)
def test_invalid_stamp_rejected(patch):
    with pytest.raises(ValidationError):
        main.StampEdit.model_validate(stamp(**patch))


def test_missing_image_and_overflow_fail_explicitly():
    for edit in [stamp(imageId="missing"), stamp(text="x" * 200)]:
        with pytest.raises(HTTPException) as error:
            run_export([edit])
        assert error.value.status_code == 422


def test_signature_field_blocks_stamp_without_invalidating_source():
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        widget = fitz.Widget()
        widget.field_name = "synthetic-signature"
        widget.field_type = fitz.PDF_WIDGET_TYPE_SIGNATURE
        widget.rect = fitz.Rect(30, 30, 200, 80)
        page.add_widget(widget)
        source = doc.tobytes()
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": 0}], "stamps": [stamp()]}
    )
    with pytest.raises(HTTPException) as error:
        main.export_organized_pdf({"source": source}, plan)
    assert "signature" in error.value.detail

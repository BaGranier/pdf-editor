"""Synthetic qualification: inspect final bytes, decoded objects, text and pixels."""

import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main

SECRET = "SECRET_TEST_12345"


def zone(page=1, rect=(30, 260, 210, 310)):
    return {
        "id": f"redact-{page}",
        "type": "redaction",
        "page": page,
        "rect": dict(zip(("x0", "y0", "x1", "y1"), rect, strict=True)),
    }


def export(source, zones, **extra):
    with fitz.open(stream=source, filetype="pdf") as doc:
        pages = [{"sourcePageIndex": i} for i in range(len(doc))]
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": pages, "redactions": zones, **extra}
    )
    return main.export_organized_pdf({"source": source}, plan)


def assert_no_secret(output):
    assert SECRET.encode() not in output
    with fitz.open(stream=output, filetype="pdf") as doc:
        for page in doc:
            assert SECRET not in page.get_text()
            assert not page.search_for(SECRET)
            assert not list(page.annots() or [])
        for xref in range(1, doc.xref_length()):
            assert SECRET not in doc.xref_object(xref)
            if doc.xref_is_stream(xref):
                stream = doc.xref_stream(xref)
                assert SECRET.encode() not in stream
                assert SECRET.encode().hex().encode() not in stream.lower()


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
@pytest.mark.parametrize("crop", [False, True])
def test_native_text_rotation_crop_and_neighbor(rotation, crop):
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_text((40, 110), SECRET)
        page.insert_text((40, 220), "PUBLIC_NEIGHBOR")
        if crop:
            page.set_cropbox(fitz.Rect(20, 20, 380, 380))
        page.set_rotation(rotation)
        source = doc.tobytes()
    result = export(source, [zone()])
    assert_no_secret(result)
    with fitz.open(stream=result, filetype="pdf") as doc:
        page = doc[0]
        assert "PUBLIC_NEIGHBOR" in page.get_text()
        assert page.rotation == rotation
        page.set_rotation(0)
        # Native PDF (50, 290) corresponds to MuPDF (50, 110), offset by CropBox.
        assert page.get_pixmap().pixel(
            50 - (20 if crop else 0), 110 - (20 if crop else 0)
        ) == (0, 0, 0)
    with fitz.open(stream=source, filetype="pdf") as original:
        assert SECRET in original[0].get_text()


def test_scan_pixels_and_vector_content_removed():
    with fitz.open() as image_doc:
        page = image_doc.new_page(width=400, height=400)
        page.insert_text((40, 110), SECRET)
        page.insert_text((40, 220), "PUBLIC")
        png = page.get_pixmap().tobytes("png")
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_image(page.rect, stream=png)
        page.draw_line((40, 100), (200, 100), color=(1, 0, 0))
        page.draw_line((40, 240), (200, 240), color=(0, 0, 1))
        source = doc.tobytes()
    result = export(source, [zone()])
    with fitz.open(stream=result, filetype="pdf") as doc:
        page = doc[0]
        assert page.get_pixmap().pixel(50, 110) == (0, 0, 0)
        assert not any(d["color"] == (1, 0, 0) for d in page.get_drawings())
        assert any(d["color"] == (0, 0, 1) for d in page.get_drawings())
        images = page.get_images(full=True)
        assert len(images) == 1
        pixels = fitz.Pixmap(doc, images[0][0])
        # Pixel data itself is replaced, not merely hidden by a black rectangle.
        assert pixels.pixel(50, 110)[:3] == (255, 255, 255)
        assert pixels.pixel(50, 220)[:3] != (0, 0, 0)


def test_shared_image_refused():
    pixels = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 100, 100), False)
    pixels.clear_with(255)
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        xref = page.insert_image(
            fitz.Rect(0, 0, 400, 400), stream=pixels.tobytes("png")
        )
        doc.new_page(width=400, height=400).insert_image(
            fitz.Rect(0, 0, 400, 400), xref=xref
        )
        source = doc.tobytes()
    with pytest.raises(HTTPException, match="") as error:
        export(source, [zone()])
    assert "partagée" in error.value.detail


@pytest.mark.parametrize(
    "kind", ["annotation", "form", "layer", "attachment", "alternative"]
)
def test_complex_sources_fail_closed(kind):
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_text((40, 110), SECRET)
        if kind == "annotation":
            page.add_text_annot((40, 100), SECRET)
        elif kind == "form":
            widget = fitz.Widget()
            widget.field_name = "private"
            widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            widget.field_value = SECRET
            widget.rect = fitz.Rect(30, 90, 220, 120)
            page.add_widget(widget)
        elif kind == "layer":
            doc.add_ocg(SECRET)
        elif kind == "attachment":
            doc.embfile_add("private.txt", SECRET.encode())
        else:
            doc.update_stream(
                page.get_contents()[0],
                b"/Span << /ActualText (SECRET_TEST_12345) >> BDC EMC",
            )
        source = doc.tobytes()
    with pytest.raises(HTTPException) as error:
        export(source, [zone()])
    assert error.value.status_code == 422


def test_prior_incremental_revisions_not_recoverable(tmp_path):
    path = tmp_path / "synthetic.pdf"
    with fitz.open() as doc:
        doc.new_page(width=400, height=400).insert_text((40, 110), SECRET)
        doc.save(path, deflate=False)
    with fitz.open(path) as doc:
        doc[0].insert_text((40, 220), "PUBLIC_NEIGHBOR")
        doc.saveIncr()
    source = path.read_bytes()
    result = export(source, [zone()])
    assert_no_secret(result)
    assert result.count(b"%%EOF") == 1
    assert path.read_bytes() == source


@pytest.mark.parametrize("rect", [(0, 0, 0, 1), (1, 2, 0, 3), (0, 0, float("nan"), 3)])
def test_invalid_rect_rejected(rect):
    with pytest.raises(ValidationError):
        main.RedactionEdit.model_validate(zone(rect=rect))


def test_outside_page_and_missing_page_refused():
    with fitz.open() as doc:
        doc.new_page(width=400, height=400)
        source = doc.tobytes()
    for edit in [zone(rect=(-1, 0, 20, 30)), zone(page=2)]:
        with pytest.raises(HTTPException):
            export(source, [edit])

import io

import fitz
import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from app import main
from test_secure_redaction import SECRET, assert_no_secret, export, zone

PUBLIC = "PUBLIC_FORM_WITNESS"


def source_with_forms(*, shared=False, repeated=False, rotate=0, too_large=False):
    with fitz.open() as layer, fitz.open() as wrapper, fitz.open() as output:
        contents = layer.new_page(width=250, height=160)
        contents.insert_text((12, 32), SECRET)
        contents.insert_text((12, 85), PUBLIC)
        contents.draw_rect((12, 118, 35, 140), color=None, fill=(0, 0, 1))
        patch = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 15, 15), False)
        patch.clear_with(80)
        contents.insert_image((135, 20, 180, 60), pixmap=patch)
        wrapper.new_page(width=250, height=160).show_pdf_page(
            fitz.Rect(0, 0, 250, 160), layer, 0
        )
        output.new_page(
            width=2500 if too_large else 600, height=2500 if too_large else 400
        )
        if shared:
            output.new_page(width=600, height=400)
        output[0].show_pdf_page(fitz.Rect(40, 25, 300, 200), wrapper, 0, rotate=rotate)
        if repeated:
            output[0].show_pdf_page(fitz.Rect(330, 25, 590, 200), wrapper, 0)
        if shared:
            output[1].show_pdf_page(fitz.Rect(40, 25, 300, 200), wrapper, 0)
        output[0].insert_text((35, 310), "OUTSIDE_FORM")
        output.new_page(width=600, height=400).insert_text((35, 310), "VECTOR_PAGE")
        return output.tobytes()


@pytest.mark.parametrize("rotate", [0, 27, 90])
def test_nested_form_is_reconstructed_without_old_streams(rotate):
    source = source_with_forms(rotate=rotate)
    with fitz.open(stream=source, filetype="pdf") as doc:
        page = doc[0]
        [hit] = page.search_for(SECRET)
        area = hit * ~page.transformation_matrix
        center = fitz.Point((hit.x0 + hit.x1) / 2, (hit.y0 + hit.y1) / 2)
    result = export(source, [zone(rect=tuple(area))])
    assert_no_secret(result)
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert not doc[0].get_xobjects()
        assert len(doc[0].get_images()) == 1
        assert doc[0].get_pixmap().pixel(int(center.x), int(center.y)) == (0, 0, 0)
        assert "VECTOR_PAGE" in doc[1].get_text()
    reader = PdfReader(io.BytesIO(result), strict=True)
    assert not reader.pages[0].extract_text().strip()
    assert "/Font" not in reader.pages[0]["/Resources"]
    assert result.count(b"%%EOF") == 1


def test_off_zone_form_and_unaffected_text_remain_vector():
    source = source_with_forms()
    with fitz.open(stream=source, filetype="pdf") as doc:
        page = doc[0]
        [hit] = page.search_for("OUTSIDE_FORM")
        area = hit * ~page.transformation_matrix
    result = export(source, [zone(rect=tuple(area))])
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert doc[0].get_xobjects()
        assert SECRET in doc[0].get_text() and PUBLIC in doc[0].get_text()
        assert "OUTSIDE_FORM" not in doc[0].get_text()


def test_shared_and_repeated_placements_preserved_visually_without_original_forms():
    source = source_with_forms(shared=True, repeated=True)
    with fitz.open(stream=source, filetype="pdf") as before:
        [hit, second] = before[0].search_for(SECRET)
        area = hit * ~before[0].transformation_matrix
        other_page = before[1].get_pixmap(clip=hit.irect)
        other_place = before[0].get_pixmap(clip=second.irect)
    result = export(source, [zone(rect=tuple(area))])
    assert_no_secret(result)
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert not doc[0].get_xobjects() and not doc[1].get_xobjects()
        for page, clip, witness in [
            (doc[0], second, other_place),
            (doc[1], hit, other_page),
        ]:
            visible = page.get_pixmap(clip=clip.irect)
            assert sum(channel < 90 for channel in visible.samples) > 30
            assert (
                sum(
                    abs(a - b)
                    for a, b in zip(visible.samples, witness.samples, strict=True)
                )
                / len(visible.samples)
                < 35
            )
        assert "VECTOR_PAGE" in doc[2].get_text()


def test_complex_raster_budget_fails_closed():
    source = source_with_forms(too_large=True)
    with fitz.open(stream=source, filetype="pdf") as doc:
        area = doc[0].search_for(SECRET)[0] * ~doc[0].transformation_matrix
    with pytest.raises(HTTPException, match="volumineuses"):
        export(source, [zone(rect=tuple(area))])


def test_export_reports_pages_reconstructed():
    source = source_with_forms()
    with fitz.open(stream=source, filetype="pdf") as doc:
        area = doc[0].search_for(SECRET)[0] * ~doc[0].transformation_matrix
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourcePageIndex": 0}, {"sourcePageIndex": 1}],
            "redactions": [zone(rect=tuple(area))],
        }
    )
    warnings = []
    main.export_organized_pdf({"source": source}, plan, warnings)
    assert [(warning.type, warning.page) for warning in warnings] == [
        ("redaction_rasterized", 1)
    ]

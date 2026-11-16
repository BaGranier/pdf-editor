import hashlib
import fitz
import pytest
from fastapi import HTTPException
from app.redaction_geometry import ResolveMatches, resolve_matches
from app import main
from test_secure_redaction import SECRET, assert_no_secret


def proof_for(doc, page_index, text, occurrence=0):
    page = doc[page_index]
    raw = page.get_text("rawdict")
    canonical = "".join(
        char["c"]
        for block in raw["blocks"]
        for line in block.get("lines", [])
        for span in line["spans"]
        for char in span["chars"]
        if not char["c"].isspace()
    )
    needle = "".join(text.split())
    position = -1
    for _ in range(occurrence + 1):
        position = canonical.index(needle, position + 1)
    return {
        "id": f"{page_index}:{position}",
        "page": page_index + 1,
        "proof": {
            "digest": hashlib.sha256(canonical.encode()).hexdigest(),
            "start": position,
            "end": position + len(needle),
            "text": needle,
        },
    }


def export_resolved(source, matches, **extra):
    resolved = resolve_matches(
        source, ResolveMatches.model_validate({"matches": matches})
    )
    with fitz.open(stream=source, filetype="pdf") as doc:
        pages = [{"sourcePageIndex": index} for index in range(len(doc))]
    zones = [
        {"id": f"r-{i}-{j}", "type": "redaction", "page": hit["page"], "rect": rect}
        for i, hit in enumerate(resolved["matches"])
        for j, rect in enumerate(hit["rects"])
    ]
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": pages, "redactions": zones, **extra}
    )
    return main.export_organized_pdf({"source": source}, plan)


@pytest.mark.parametrize("rotation", [0, 90, 270])
def test_all_occurrences_removed_on_rotated_mixed_pages(rotation):
    with fitz.open() as doc:
        matches = []
        for index, (width, height) in enumerate([(400, 600), (600, 400)]):
            page = doc.new_page(width=width, height=height)
            page.insert_text((40, 110), f"{SECRET} PUBLIC {SECRET}")
            page.insert_text((40, 220), "NEIGHBOR")
            page.set_rotation(rotation)
            matches.extend(
                proof_for(doc, index, SECRET, occurrence) for occurrence in [0, 1]
            )
        source = doc.tobytes()
    output = export_resolved(source, matches)
    assert_no_secret(output)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert all(
            "PUBLIC" in page.get_text() and "NEIGHBOR" in page.get_text()
            for page in doc
        )


def test_single_occurrence_does_not_remove_second():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((40, 100), f"{SECRET} PUBLIC {SECRET}")
        matches = [proof_for(doc, 0, SECRET)]
        source = doc.tobytes()
    output = export_resolved(source, matches)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert doc[0].get_text().count(SECRET) == 1


def test_multiline_expression_produces_separate_rects():
    with fitz.open() as doc:
        page = doc.new_page()
        page.insert_text((40, 100), "Secret")
        page.insert_text((40, 120), "été")
        source = doc.tobytes()
        match = proof_for(doc, 0, "Secret été")
    result = resolve_matches(
        source, ResolveMatches.model_validate({"matches": [match]})
    )
    assert len(result["matches"][0]["rects"]) == 2


def test_mismatch_fails_closed_without_partial_results():
    with fitz.open() as doc:
        doc.new_page().insert_text((40, 100), SECRET)
        match = proof_for(doc, 0, SECRET)
        source = doc.tobytes()
    match["proof"]["digest"] = "0" * 64
    with pytest.raises(HTTPException) as error:
        resolve_matches(source, ResolveMatches.model_validate({"matches": [match]}))
    assert error.value.status_code == 409


def test_ocr_layer_and_scan_pixels_are_both_removed():
    with fitz.open() as image_doc:
        image_doc.new_page(width=400, height=400).insert_text((40, 110), SECRET)
        png = image_doc[0].get_pixmap().tobytes("png")
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_image(page.rect, stream=png)
        page.insert_text((40, 110), SECRET, render_mode=3)
        match = proof_for(doc, 0, SECRET)
        source = doc.tobytes()
    output = export_resolved(source, [match])
    assert_no_secret(output)
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert doc[0].get_pixmap().pixel(50, 110) == (0, 0, 0)
        image = doc[0].get_images(full=True)[0]
        assert fitz.Pixmap(doc, image[0]).pixel(50, 110) == (255, 255, 255)

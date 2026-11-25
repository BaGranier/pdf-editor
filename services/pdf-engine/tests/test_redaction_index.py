import asyncio
import io
import json
import shutil

import fitz
import pytest
from fastapi import UploadFile

from app import main
from app.ocr_runtime import bundled_runtime
from test_secure_redaction import SECRET, assert_no_secret, export, zone


def index(source, **options):
    async def collect():
        upload = UploadFile(io.BytesIO(source), filename="synthetic.pdf")
        response = await main.index_redaction_text(upload, json.dumps(options))
        return [json.loads(line) async for line in response.body_iterator]

    return asyncio.run(collect())


def text(lines):
    return " ".join("".join(glyph for glyph, _ in line) for line in lines)


def find_zone(page, key, term):
    for line in page[key]:
        content = "".join(char for char, _ in line)
        start = content.find(term)
        if start >= 0:
            rect = fitz.Rect()
            for _, bounds in line[start : start + len(term)]:
                rect |= fitz.Rect(bounds)
            return zone(
                page["page"], (rect.x0 + 0.05, rect.y0, rect.x1 - 0.05, rect.y1)
            )
    raise AssertionError(f"{term!r} not recognized in {text(page[key])!r}")


def test_large_mixed_size_index_and_export():
    with fitz.open() as doc:
        for number in range(250):
            page = doc.new_page(width=300 + number % 3 * 20, height=420)
            page.insert_text((40, 80), "Témoin " + str(number))
            page.insert_text((40, 120), SECRET)
            page.set_rotation((number % 4) * 90)
        source = doc.tobytes()
    indexed = index(source)
    assert len(indexed) == 250
    assert all(not page["issue"] for page in indexed)
    result = export(source, [find_zone(page, "native", SECRET) for page in indexed])
    assert_no_secret(result)
    with fitz.open(stream=result, filetype="pdf") as doc:
        assert doc.page_count == 250
        assert "Témoin 249" in doc[-1].get_text()
        assert doc[249].rotation == 90


@pytest.mark.parametrize("rotation", [0, 90, 270])
def test_partial_unsaved_text_and_comment_anchor(rotation):
    edit = {
        "id": "unsaved",
        "type": "add_text",
        "page": 1,
        "rect": {"x0": 40, "y0": 200, "x1": 350, "y1": 300},
        "text": f"Début {SECRET} FIN",
        "style": {"fontFamily": "Helvetica", "fontSize": 15, "color": "#111111"},
    }
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.set_cropbox(fitz.Rect(10, 10, 390, 390))
        page.set_rotation(rotation)
        page.insert_text((40, 320), "UNTOUCHED")
        source = doc.tobytes()
    [indexed] = index(source, editedOnly=True, edits=[edit])
    redaction = find_zone(indexed, "native", SECRET)
    anchor = find_zone(indexed, "native", "UNTOUCHED")["rect"]
    result = export(
        source,
        [redaction],
        edits=[edit],
        comments=[
            {
                "id": "selection-note",
                "type": "comment",
                "page": 1,
                "rect": anchor,
                "rects": [anchor],
                "content": "Note sur la sélection",
            }
        ],
    )
    with fitz.open(stream=result, filetype="pdf") as doc:
        page = doc[0]
        content = page.get_text()
        assert SECRET not in content
        assert "Début" in content and "FIN" in content
        assert "UNTOUCHED" in content
        assert page.rotation == rotation
        [note] = list(page.annots())
        assert note.type[0] == fitz.PDF_ANNOT_HIGHLIGHT
        assert (
            len(note.vertices) == 4 and note.info["content"] == "Note sur la sélection"
        )
        for xref in range(1, doc.xref_length()):
            if doc.xref_is_stream(xref):
                assert (
                    SECRET.encode().hex().encode() not in doc.xref_stream(xref).lower()
                )


@pytest.mark.integration
def test_real_ocr_for_scan_hybrid_and_preexisting_layer():
    if bundled_runtime() is None and shutil.which("tesseract") is None:
        pytest.skip("Tesseract is unavailable")
    term = "PRIVATE"
    with fitz.open() as raster:
        page = raster.new_page(width=440, height=320)
        page.insert_text((55, 95), "PRIVATE", fontsize=32)
        page.insert_text((55, 175), "PUBLIC", fontsize=32)
        pixels = page.get_pixmap(dpi=150)
    with fitz.open() as doc:
        for number in range(3):
            page = doc.new_page(width=440, height=360)
            page.insert_image(page.rect + (0, 0, 0, -40), pixmap=pixels)
            if number == 1:
                page.insert_text((55, 330), "NATIVE HYBRID", fontsize=20)
                page.set_rotation(90)
            if number == 2:
                page.insert_text((55, 95), term, fontsize=32, render_mode=3)
                page.insert_text((55, 175), "PUBLIC", fontsize=32, render_mode=3)
        # Distinct source image objects are required by the secure export policy.
        for number, page in enumerate(doc):
            if number:
                old = page.get_images()[0][0]
                new = doc.get_new_xref()
                doc.update_object(new, "<<>>")
                doc.xref_copy(old, new)
                resources = int(doc.xref_get_key(page.xref, "Resources")[1].split()[0])
                doc.xref_set_key(
                    resources, "XObject/" + page.get_images()[0][7], f"{new} 0 R"
                )
        source = doc.tobytes()
    pages = index(source)
    assert term in text(pages[0]["ocr"])
    assert term in text(pages[1]["ocr"])
    assert "NATIVE HYBRID" in text(pages[1]["native"])
    assert term in text(pages[2]["native"])
    assert term not in text(pages[2]["ocr"])
    zones = [
        find_zone(page, "native" if page["page"] == 3 else "ocr", term)
        for page in pages
    ]
    result = export(source, zones)
    with fitz.open(stream=result, filetype="pdf") as doc:
        for i, page in enumerate(doc):
            page.set_rotation(0)
            rect = fitz.Rect(*zones[i]["rect"].values()) * page.transformation_matrix
            assert term not in page.get_text()
            center = (rect.tl + rect.br) / 2
            assert page.get_pixmap().pixel(int(center.x), int(center.y)) == (0, 0, 0)
            assert page.get_pixmap().pixel(5, 220) == (255, 255, 255)


def test_ocr_failure_reports_page_and_keeps_native_text(monkeypatch):
    async def unavailable():
        raise ValueError("unavailable")

    monkeypatch.setattr(main, "redaction_languages", unavailable)
    with fitz.open() as doc:
        page = doc.new_page()
        page.draw_rect(fitz.Rect(10, 10, 40, 40))
        [page] = index(doc.tobytes())
    assert page["issue"] and "échec" in page["issue"]
    assert not page["ocr"]

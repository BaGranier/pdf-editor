"""One generated scene exercises the real export engine, without binary goldens."""

import importlib
import sys
from pathlib import Path

import fitz
import pytest
from pypdf import PdfReader
import io

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
fixtures = importlib.import_module("scripts.editor-robustness-fixtures")
from app import main  # noqa: E402


@pytest.mark.parametrize("opacity", [0, 0.25, 0.5, 0.75, 1])
@pytest.mark.parametrize("front", [True, False])
def test_global_scene_order_opacity_text_comments_and_form(opacity, front):
    source, edits, assets = fixtures.scene()
    original = bytes(source)
    alpha = next(edit for edit in edits if edit["id"] == "alpha")
    alpha["style"]["opacity"] = opacity
    opaque = next(edit for edit in edits if edit["id"] == "opaque")
    edits.remove(opaque)
    edits.insert(len(edits) if front else 0, opaque)
    plan = fixtures.plan(edits, assets)
    output = main.export_organized_pdf(
        {"source": source}, main.OrganizeExportPlan.model_validate(plan)
    )
    with fitz.open(stream=output) as document:
        page = document[0]
        assert "SOURCE SELECTABLE" in page.get_text()
        assert "ADDED EDITABLE WITNESS" in page.get_text()
        assert len(page.get_image_info()) == 3
        assert len(page.get_drawings()) >= 9
        notes = list(page.annots())
        assert len(notes) == 1 and notes[0].flags & fitz.PDF_ANNOT_IS_HIDDEN
        assert notes[0].info["content"] == "GLOBAL COMMENT WITNESS"
        assert list(page.widgets())[0].field_value == "Form witness"
        # At this interior point, only the blue image and red alpha rectangle overlap.
        pixel = page.get_pixmap().pixel(180, 400 - 200)
        assert pixel == pytest.approx(
            (round(255 * opacity), 0, round(255 * (1 - opacity))), abs=3
        )
    reader = PdfReader(io.BytesIO(output), strict=True)
    assert (
        len(reader.pages) == 1 and "SOURCE SELECTABLE" in reader.pages[0].extract_text()
    )
    assert source == original

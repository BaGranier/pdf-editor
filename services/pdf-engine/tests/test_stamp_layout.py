import json
from pathlib import Path
import fitz
import pytest
from app import main
from app.stamp_layout import layout_stamp
from test_stamp_export import run_export, stamp


@pytest.mark.parametrize(
    "text", ["REÇU", "CONFIDENTIEL", "BROUILLON", "REÇU\n16/11/2026"]
)
def test_v2_actual_pdf_is_centered_and_scales(text):
    sizes = []
    for rect in [(30, 100, 190, 170), (30, 100, 350, 240)]:
        output = run_export(
            [
                stamp(
                    text=text,
                    rect=dict(zip(("x0", "y0", "x1", "y1"), rect)),
                    layoutVersion=2,
                    fontSizeMode="fit",
                    fillOpacity=0.1,
                    rotation=0,
                    opacity=1,
                )
            ]
        )
        with fitz.open(stream=output, filetype="pdf") as doc:
            assert text.split("\n")[0] in doc[0].get_text()
            spans = [
                span
                for block in doc[0].get_text("dict")["blocks"]
                if "lines" in block
                for line in block["lines"]
                for span in line["spans"]
                if span["text"] == text.split("\n")[0]
            ]
            sizes.append(spans[0]["size"])
            fills = [drawing for drawing in doc[0].get_drawings() if drawing["fill"]]
            assert fills[0]["fill_opacity"] == pytest.approx(0.1)
    assert sizes[1] > sizes[0] * 1.9


def test_generated_browser_metrics_match_real_pdf_fonts():
    root = Path(__file__).resolve().parents[3]
    generated = json.loads(
        (root / "apps/web/src/editing/stampMetrics.generated.json").read_text()
    )
    for family, data in generated.items():
        font = fitz.Font(
            fontfile=str(
                main.BUNDLED_FONT_DIR / main.BUNDLED_FONT_FILES[data["fontRef"]]
            )
        )
        for code, glyph in data["glyphs"].items():
            assert glyph == pytest.approx(
                [font.glyph_advance(int(code)), *font.glyph_bbox(int(code))]
            )
        size, lines = layout_stamp("REÇU", font, 220, 90, 20, "fit", 0.1, 2, "center")
        assert size > 20 and len(lines) == 1


def test_legacy_stamp_remains_fixed_without_background():
    output = run_export([stamp(text="REÇU", rotation=0, opacity=1)])
    with fitz.open(stream=output, filetype="pdf") as doc:
        assert not any(d["fill"] for d in doc[0].get_drawings())
        assert any(
            span["size"] == pytest.approx(20)
            for block in doc[0].get_text("dict")["blocks"]
            if "lines" in block
            for line in block["lines"]
            for span in line["spans"]
            if "REÇU" in span["text"]
        )

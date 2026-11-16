import json
from pathlib import Path
import fitz
import pytest
from app import main
from app.stamp_layout import layout_stamp
from app.stamp_font_metrics import measured_glyphs
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
        real = measured_glyphs(font, {int(code) for code in data["glyphs"]})
        for code, glyph in data["glyphs"].items():
            assert glyph == pytest.approx(real[int(code)])
        assert real[ord("C")][2] > real[ord("Ç")][2]
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


def test_global_alpha_multiplies_each_primitive_once():
    output = run_export(
        [
            stamp(
                text="REÇU",
                layoutVersion=2,
                fontSizeMode="fit",
                rotation=0,
                opacity=0.5,
                fillOpacity=0.1,
                textOpacity=0.4,
                borderOpacity=0.6,
                linkedColors=False,
                textColor="#0000ff",
                fillColor="#ff0000",
                borderColor="#00ff00",
            )
        ]
    )
    with fitz.open(stream=output, filetype="pdf") as doc:
        drawings = doc[0].get_drawings()
        assert next(d for d in drawings if d["fill"])["fill_opacity"] == pytest.approx(
            0.05
        )
        assert next(d for d in drawings if d["color"])[
            "stroke_opacity"
        ] == pytest.approx(0.3)
        span = next(
            span for span in doc[0].get_texttrace() if span["color"] == (0, 0, 1)
        )
        assert span["opacity"] == pytest.approx(0.2)


def test_modern_nested_stamp_is_really_removed_by_final_redaction():
    from test_secure_redaction import SECRET, assert_no_secret, zone

    output = run_export(
        [
            stamp(
                text=SECRET,
                rect=zone()["rect"],
                layoutVersion=2,
                fontSizeMode="fit",
                fillOpacity=0.1,
                rotation=0,
            )
        ],
        redactions=[zone()],
    )
    assert_no_secret(output)


def test_independent_reader_has_valid_used_unicode_map(caplog):
    import io
    from pypdf import PdfReader

    output = run_export(
        [stamp(text="REÇU À ÉÈ Ç", layoutVersion=2, fontSizeMode="fit", rotation=0)]
    )
    assert "REÇU À ÉÈ Ç" in PdfReader(io.BytesIO(output)).pages[0].extract_text()
    assert not any(
        "broken line" in record.message or "hex string" in record.message
        for record in caplog.records
    )

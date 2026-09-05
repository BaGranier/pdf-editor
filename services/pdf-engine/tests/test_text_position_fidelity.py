from __future__ import annotations

import fitz
import pytest

from app import main


@pytest.fixture
def source_pdf() -> bytes:
    document = fitz.open()
    document.new_page(width=612, height=792)
    source = document.tobytes(garbage=4, deflate=True, no_new_id=True)
    document.close()
    return source


def _text_edit(
    *,
    text: str,
    font_family: str = "Helvetica",
    font_size: int = 12,
    bold: bool = False,
    rect: tuple[float, float, float, float] = (100.25, 200, 500, 260),
) -> main.AddTextEdit:
    return main.AddTextEdit.model_validate(
        {
            "id": f"position-{font_family}-{font_size}-{bold}",
            "type": "add_text",
            "page": 1,
            "rect": dict(zip(("x0", "y0", "x1", "y1"), rect, strict=True)),
            "text": text,
            "style": {
                "fontFamily": font_family,
                "fontSize": font_size,
                "color": "#000000",
                "bold": bold,
            },
        }
    )


def _export_and_find_span(
    edit: main.AddTextEdit,
    source: bytes,
) -> tuple[dict[str, object], bytes]:
    exported = main.apply_visual_edits(source, {0: [edit]}, {}, {})

    with fitz.open(stream=exported, filetype="pdf") as document:
        spans = [
            span
            for block in document[0].get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
            if span["text"] == edit.text
        ]

    assert len(spans) == 1
    return spans[0], source


@pytest.mark.parametrize(
    ("font_family", "bold"),
    [
        ("Helvetica", False),
        ("Times", False),
        ("Courier", False),
        ("Helvetica", True),
    ],
)
@pytest.mark.parametrize("font_size", [6, 12, 24])
def test_exported_glyph_origin_and_width_match_the_native_textbox(
    font_family: str,
    bold: bool,
    font_size: int,
    source_pdf: bytes,
) -> None:
    text = f"ABCDEFG-{font_family}-{font_size}-{'bold' if bold else 'regular'}"
    edit = _text_edit(
        text=text,
        font_family=font_family,
        font_size=font_size,
        bold=bold,
    )
    span, source = _export_and_find_span(edit, source_pdf)

    with fitz.open(stream=source, filetype="pdf") as document:
        page_rect = fitz.Rect(
            edit.rect.x0,
            edit.rect.y0,
            edit.rect.x1,
            edit.rect.y1,
        ) * document[0].transformation_matrix
    font_name = main.FONT_NAMES[(font_family, bold)]
    expected_width = fitz.get_text_length(
        text,
        fontname=font_name,
        fontsize=font_size,
    )
    x0, y0, x1, _y1 = span["bbox"]

    assert x0 == pytest.approx(page_rect.x0, abs=0.05)
    assert y0 == pytest.approx(page_rect.y0, abs=0.05)
    assert x1 == pytest.approx(page_rect.x0 + expected_width, abs=0.05)


def test_minimum_textbox_keeps_its_native_origin(source_pdf: bytes) -> None:
    edit = _text_edit(
        text="Q",
        font_size=6,
        rect=(100.25, 200, 108.25, 209),
    )
    span, source = _export_and_find_span(edit, source_pdf)

    with fitz.open(stream=source, filetype="pdf") as document:
        expected_top = document[0].rect.height - edit.rect.y1

    assert span["bbox"][0] == pytest.approx(100.25, abs=0.05)
    assert span["bbox"][1] == pytest.approx(expected_top, abs=0.05)


def test_wrapped_lines_share_the_native_left_edge(source_pdf: bytes) -> None:
    edit = _text_edit(
        text="Le texte doit commencer exactement ici et revenir à la ligne.",
        rect=(100.25, 200, 220.25, 320),
    )
    exported = main.apply_visual_edits(source_pdf, {0: [edit]}, {}, {})

    with fitz.open(stream=exported, filetype="pdf") as document:
        lines = [
            line
            for block in document[0].get_text("dict")["blocks"]
            for line in block.get("lines", [])
            if any("Le texte" in span["text"] for span in line["spans"])
            or any("exactement" in span["text"] for span in line["spans"])
        ]

    assert len(lines) >= 2
    assert all(line["bbox"][0] == pytest.approx(100.25, abs=0.05) for line in lines)
    assert source_pdf.startswith(b"%PDF-")


def test_supported_french_accents_do_not_move_the_origin(source_pdf: bytes) -> None:
    edit = _text_edit(text="Été à Béziers, déjà créé.")
    span, _source = _export_and_find_span(edit, source_pdf)

    assert span["bbox"][0] == pytest.approx(100.25, abs=0.05)

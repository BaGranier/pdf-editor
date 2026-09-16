from __future__ import annotations

import hashlib
import base64
from pathlib import Path

import fitz
import pytest
from fastapi import HTTPException

from app.main import (
    AddTextStyle,
    BUNDLED_FONT_FILES,
    NativeTextEdit,
    NativeTextFontValidationPlan,
    NativeTextSource,
    PdfEditPoint,
    PdfEditRect,
    FontResourcePayload,
    _decode_font_resources,
    _iter_native_text_spans,
    _validate_native_text_font_for_export,
    apply_visual_edits,
)


@pytest.mark.parametrize("font_ref,file_name", BUNDLED_FONT_FILES.items())
def test_every_bundled_regular_font_can_be_embedded_and_extracted(
    font_ref: str, file_name: str
) -> None:
    font_path = (
        Path(__file__).parents[3] / "apps" / "web" / "public" / "fonts" / file_name
    )
    font = fitz.Font(fontfile=str(font_path))
    sample = "Français 1 375 €"
    assert all(
        character.isspace() or font.has_glyph(ord(character)) for character in sample
    )

    document = fitz.open()
    page = document.new_page()
    page.insert_text(
        (40, 80), sample, fontname="BundledTest", fontfile=str(font_path), fontsize=12
    )
    exported = document.tobytes()
    document.close()
    with fitz.open(stream=exported, filetype="pdf") as reopened:
        assert " ".join(reopened[0].get_text().split()) == sample, font_ref


def _source_pdf(*, rotation: int = 0) -> bytes:
    document = fitz.open()
    page = document.new_page(width=420, height=260)
    page.draw_rect(page.rect, color=None, fill=(0.82, 0.9, 0.72), overlay=False)
    pixmap = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 120, 60), False)
    pixmap.clear_with(105)
    page.insert_image(
        fitz.Rect(35, 55, 285, 175), stream=pixmap.tobytes("png"), overlay=True
    )
    page.draw_rect(
        fitz.Rect(28, 48, 292, 182), color=(0.8, 0.1, 0.1), width=3, overlay=True
    )
    page.insert_text(
        (60, 108),
        "Montant total : 1 250 EUR",
        fontname="helv",
        fontsize=18,
        color=(1, 1, 1),
        overlay=True,
    )
    page.insert_text(
        (40, 225),
        "Texte inchangé",
        fontname="helv",
        fontsize=13,
        color=(0, 0, 0),
        overlay=True,
    )
    if rotation:
        page.set_rotation(rotation)
    source = document.tobytes()
    document.close()
    return source


def _native_edit(
    source: bytes, replacement: str = "Montant total : 1 375 EUR"
) -> NativeTextEdit:
    with fitz.open(stream=source, filetype="pdf") as document:
        span = next(
            item
            for item in _iter_native_text_spans(document[0], 0)
            if item["sourceText"].startswith("Montant total")
        )
    bbox = span["sourceBBox"]
    origin = span["sourceOrigin"]
    return NativeTextEdit(
        id="native-amount",
        type="native_text",
        page=1,
        rect=PdfEditRect(**bbox),
        source=NativeTextSource(
            sourceId=span["sourceId"],
            sourceText=span["sourceText"],
            sourceBBox=bbox,
            sourceOrigin=PdfEditPoint(**origin),
            sourceFontName=span["sourceFontName"],
            sourceFontResourceId=span["sourceFontResourceId"],
            sourceFontSize=span["sourceFontSize"],
            sourceColor=span["sourceColor"],
            sourceRotation=span["sourceRotation"],
            sourceFingerprint=span["sourceFingerprint"],
            editable=True,
        ),
        text=replacement,
        style=AddTextStyle(
            fontFamily="Helvetica",
            fontRef="pdf-standard:helvetica:400:normal",
            fontSize=18,
            color="#ffffff",
            bold=False,
        ),
    )


def _pixel_differences_outside(
    before: fitz.Pixmap, after: fitz.Pixmap, excluded: fitz.Rect
) -> int:
    differences = 0
    before_samples = before.samples
    after_samples = after.samples
    for y in range(before.height):
        for x in range(before.width):
            offset = (y * before.width + x) * before.n
            if before_samples[offset : offset + 3] != after_samples[
                offset : offset + 3
            ] and not excluded.contains(fitz.Point(x, y)):
                differences += 1
    return differences


@pytest.mark.parametrize("rotation", [0, 90, 180, 270])
def test_native_text_replacement_is_extractable_and_preserves_non_text_content(
    rotation: int,
) -> None:
    source = _source_pdf(rotation=rotation)
    edit = _native_edit(source)
    with fitz.open(stream=source, filetype="pdf") as before_document:
        before_page = before_document[0]
        before_pixmap = before_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        before_images = len(before_page.get_images(full=True))
        before_drawings = len(before_page.get_drawings())

    result = apply_visual_edits(
        source, {}, {}, {}, native_text_edits_by_output_page={0: [edit]}
    )

    with fitz.open(stream=result, filetype="pdf") as after_document:
        after_page = after_document[0]
        extracted = after_page.get_text()
        assert "1 250" not in extracted
        assert "1 375" in extracted
        assert "Texte inchangé" in extracted
        assert len(after_page.get_images(full=True)) == before_images
        assert len(after_page.get_drawings()) == before_drawings
        after_pixmap = after_page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        page_bbox = (
            fitz.Rect(list(edit.source.source_bbox.model_dump().values()))
            * after_page.transformation_matrix
            * after_page.rotation_matrix
        )
        excluded = fitz.Rect(
            page_bbox.x0 * 2 - 5,
            page_bbox.y0 * 2 - 5,
            page_bbox.x1 * 2 + 5,
            page_bbox.y1 * 2 + 5,
        )
        assert _pixel_differences_outside(before_pixmap, after_pixmap, excluded) == 0


def test_native_text_rejects_a_changed_fingerprint_without_touching_another_span() -> (
    None
):
    source = _source_pdf()
    edit = _native_edit(source)
    edit.source.source_fingerprint = hashlib.sha256(b"wrong target").hexdigest()
    with pytest.raises(HTTPException) as caught:
        apply_visual_edits(
            source, {}, {}, {}, native_text_edits_by_output_page={0: [edit]}
        )
    assert caught.value.status_code == 409
    assert "ambiguë" in str(caught.value.detail)


def test_native_text_extraction_is_page_scoped_and_reports_source_style() -> None:
    with fitz.open(stream=_source_pdf(), filetype="pdf") as document:
        spans = list(_iter_native_text_spans(document[0], 0))
    amount = next(
        span for span in spans if span["sourceText"].startswith("Montant total")
    )
    assert amount["editable"] is True
    assert amount["sourceFontName"] == "Helvetica"
    assert amount["sourceFontSize"] == pytest.approx(18)
    assert amount["sourceColor"] == "#ffffff"
    assert len(amount["sourceFingerprint"]) == 64


def test_invisible_ocr_text_is_reported_as_non_editable() -> None:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((40, 60), "OCR caché", render_mode=3)
    spans = list(_iter_native_text_spans(page, 0))
    assert spans[0]["editable"] is False
    assert spans[0]["limitation"] == "invisible_text"
    assert "pixels" in spans[0]["limitationMessage"]


def test_bundled_font_is_embedded_for_accented_native_replacement() -> None:
    source = _source_pdf()
    edit = _native_edit(source, "Montant révisé : 1 375 €")
    edit.style = AddTextStyle(
        fontFamily="Noto Sans",
        fontRef="bundled:noto-sans:400:normal",
        fontSize=18,
        color="#ffffff",
        bold=False,
    )
    result = apply_visual_edits(
        source, {}, {}, {}, native_text_edits_by_output_page={0: [edit]}
    )
    with fitz.open(stream=result, filetype="pdf") as document:
        assert "Montant révisé : 1 375 €" in document[0].get_text()
        assert any(
            "NotoSans" in font[3].replace(" ", "")
            for font in document[0].get_fonts(full=True)
        )


def test_missing_glyph_is_rejected_instead_of_exporting_tofu() -> None:
    source = _source_pdf()
    edit = _native_edit(source, "Montant : 漢字")
    with pytest.raises(HTTPException) as caught:
        apply_visual_edits(
            source, {}, {}, {}, native_text_edits_by_output_page={0: [edit]}
        )
    assert caught.value.status_code == 422
    assert "glyphes nécessaires" in str(caught.value.detail)


def test_native_text_font_validation_uses_export_rules_without_persisting_pdf() -> None:
    source = _source_pdf()
    valid = NativeTextFontValidationPlan(
        pageIndex=0,
        edit=_native_edit(source, "Montant : 1 375 EUR"),
    )
    _validate_native_text_font_for_export(source, valid)

    invalid = NativeTextFontValidationPlan(
        pageIndex=0,
        edit=_native_edit(source, "Montant : 漢字"),
    )
    with pytest.raises(HTTPException, match="glyphes nécessaires"):
        _validate_native_text_font_for_export(source, invalid)


def test_embedded_source_font_is_identified_and_reused() -> None:
    font_path = (
        Path(__file__).parents[3]
        / "apps"
        / "web"
        / "public"
        / "fonts"
        / "NotoSans-Regular.ttf"
    )
    source_document = fitz.open()
    page = source_document.new_page(width=420, height=260)
    page.insert_text(
        (40, 90),
        "Montant total Français 1250 €",
        fontname="SourceNoto",
        fontfile=str(font_path),
        fontsize=18,
    )
    source = source_document.tobytes()
    source_document.close()

    edit = _native_edit(source, "Montant total Français 1375 €")
    assert edit.source.source_font_resource_id is not None
    edit.style = AddTextStyle(
        fontFamily="Noto Sans",
        fontRef=f"document:{edit.source.source_font_resource_id}",
        fontSize=18,
        color="#000000",
        bold=False,
    )
    result = apply_visual_edits(
        source, {}, {}, {}, native_text_edits_by_output_page={0: [edit]}
    )
    with fitz.open(stream=result, filetype="pdf") as document:
        assert "Montant total Français 1375 €" in document[0].get_text()
        assert "1250" not in document[0].get_text()


def test_custom_font_payload_hash_is_validated_and_font_is_embedded() -> None:
    font_path = (
        Path(__file__).parents[3]
        / "apps"
        / "web"
        / "public"
        / "fonts"
        / "FiraMono-Regular.ttf"
    )
    binary = font_path.read_bytes()
    digest = hashlib.sha256(binary).hexdigest()
    payload = FontResourcePayload(
        id=f"custom:{digest}",
        sha256=digest,
        format="ttf",
        fileName="FiraMono-Regular.ttf",
        dataUrl="data:font/ttf;base64," + base64.b64encode(binary).decode("ascii"),
    )
    resources = _decode_font_resources([payload])
    source = _source_pdf()
    edit = _native_edit(source, "Montant : 1 375 EUR")
    edit.style = AddTextStyle(
        fontFamily="Fira Mono",
        fontRef=f"custom:{digest}",
        fontSize=18,
        color="#ffffff",
        bold=False,
    )
    result = apply_visual_edits(
        source,
        {},
        {},
        {},
        native_text_edits_by_output_page={0: [edit]},
        font_resources=resources,
    )
    with fitz.open(stream=result, filetype="pdf") as document:
        assert "1 375" in document[0].get_text()
        assert any(
            "FiraMono" in font[3].replace(" ", "")
            for font in document[0].get_fonts(full=True)
        )

    tampered = payload.model_copy(update={"sha256": "f" * 64})
    with pytest.raises(HTTPException, match="intégrité"):
        _decode_font_resources([tampered])

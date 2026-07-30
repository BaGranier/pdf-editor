from __future__ import annotations

import asyncio
from pathlib import Path
from urllib.parse import unquote

import pytest

from app.conversion.errors import ConversionError
from app.conversion.filenames import (
    MAX_OUTPUT_FILENAME_LENGTH,
    build_conversion_download_name,
)
from app.conversion.models import DocxMode, TargetFormat
from app.conversion.routes import convert_pdf
from app.conversion.service import cleanup_temporary_directory
from tests.test_conversion import make_text_pdf, make_upload


@pytest.mark.parametrize(
    ("target", "mode", "pages", "expected"),
    [
        (
            TargetFormat.DOCX,
            DocxMode.EDITABLE,
            [1, 2],
            "rapport annuel.docx",
        ),
        (
            TargetFormat.DOCX,
            DocxMode.VISUAL,
            [1, 2],
            "rapport annuel-visual.docx",
        ),
        (TargetFormat.TXT, DocxMode.EDITABLE, [1], "rapport annuel.txt"),
        (TargetFormat.HTML, DocxMode.EDITABLE, [1], "rapport annuel.html"),
        (
            TargetFormat.PNG,
            DocxMode.EDITABLE,
            [3],
            "rapport annuel-page-003.png",
        ),
        (
            TargetFormat.JPEG,
            DocxMode.EDITABLE,
            [2],
            "rapport annuel-page-002.jpg",
        ),
        (
            TargetFormat.PNG,
            DocxMode.EDITABLE,
            [1, 2],
            "rapport annuel-images.zip",
        ),
        (
            TargetFormat.JPEG,
            DocxMode.EDITABLE,
            [1, 2],
            "rapport annuel-images.zip",
        ),
    ],
)
def test_default_conversion_download_names(
    target: TargetFormat,
    mode: DocxMode,
    pages: list[int],
    expected: str,
) -> None:
    assert build_conversion_download_name(
        source_filename="rapport annuel.pdf",
        requested_filename=None,
        target_format=target,
        docx_mode=mode,
        page_numbers=pages,
    ) == expected


@pytest.mark.parametrize(
    ("requested", "target", "pages", "expected"),
    [
        ("mon-document", TargetFormat.DOCX, [1], "mon-document.docx"),
        ("mon-document.docx", TargetFormat.DOCX, [1], "mon-document.docx"),
        ("mon-document.txt", TargetFormat.DOCX, [1], "mon-document.docx"),
        ("mon-document.exe", TargetFormat.DOCX, [1], "mon-document.docx"),
        ("../../secret.docx", TargetFormat.DOCX, [1], "secret.docx"),
        (
            ' bilan:/\\*?"<>| final.txt ',
            TargetFormat.TXT,
            [1],
            "final.txt",
        ),
        ("mes-images.png", TargetFormat.PNG, [1, 2], "mes-images.zip"),
    ],
)
def test_custom_conversion_names_are_sanitized_and_forced(
    requested: str,
    target: TargetFormat,
    pages: list[int],
    expected: str,
) -> None:
    assert build_conversion_download_name(
        source_filename="source.pdf",
        requested_filename=requested,
        target_format=target,
        docx_mode=DocxMode.EDITABLE,
        page_numbers=pages,
    ) == expected


def test_empty_custom_name_has_stable_error() -> None:
    with pytest.raises(ConversionError) as captured:
        build_conversion_download_name(
            source_filename="source.pdf",
            requested_filename=" \t ",
            target_format=TargetFormat.DOCX,
            docx_mode=DocxMode.EDITABLE,
            page_numbers=[1],
        )

    assert captured.value.code == "INVALID_OUTPUT_FILENAME"
    assert captured.value.status_code == 422


def test_missing_and_long_names_use_safe_bounded_fallbacks() -> None:
    fallback = build_conversion_download_name(
        source_filename="",
        requested_filename=None,
        target_format=TargetFormat.TXT,
        docx_mode=DocxMode.EDITABLE,
        page_numbers=[1],
    )
    long_name = build_conversion_download_name(
        source_filename="source.pdf",
        requested_filename=f"{'a' * 300}.html",
        target_format=TargetFormat.HTML,
        docx_mode=DocxMode.EDITABLE,
        page_numbers=[1],
    )

    assert fallback == "document-converti.txt"
    assert len(long_name) == MAX_OUTPUT_FILENAME_LENGTH
    assert long_name.endswith(".html")


def test_header_injection_characters_are_removed() -> None:
    filename = build_conversion_download_name(
        source_filename="source.pdf",
        requested_filename="rapport\r\nX-Injected: yes.docx",
        target_format=TargetFormat.DOCX,
        docx_mode=DocxMode.EDITABLE,
        page_numbers=[1],
    )

    assert filename == "rapportX-Injected- yes.docx"
    assert "\r" not in filename
    assert "\n" not in filename


def test_endpoint_uses_custom_content_disposition_and_correct_mime() -> None:
    response = asyncio.run(
        convert_pdf(
            file=make_upload(
                make_text_pdf(["Filename endpoint witness"]),
                "source document.pdf",
            ),
            target_format="txt",
            languages="eng",
            ocr_mode="auto",
            output_filename="résultat final.docx",
        )
    )
    output_path = Path(response.path)
    try:
        content_disposition = unquote(response.headers["content-disposition"])
        assert "résultat final.txt" in content_disposition
        assert response.media_type == "text/plain; charset=utf-8"
    finally:
        cleanup_temporary_directory(output_path.parent)


def test_invalid_endpoint_name_cleans_generated_temporary_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = tmp_path / "conversion-filename-error"

    def create_directory() -> Path:
        temporary_directory.mkdir()
        return temporary_directory

    monkeypatch.setattr(
        "app.conversion.service.create_temporary_directory",
        create_directory,
    )
    with pytest.raises(ConversionError, match="ne peut pas être vide"):
        asyncio.run(
            convert_pdf(
                file=make_upload(make_text_pdf(["Cleanup witness"])),
                target_format="txt",
                languages="eng",
                ocr_mode="auto",
                output_filename="",
            )
        )

    assert not temporary_directory.exists()

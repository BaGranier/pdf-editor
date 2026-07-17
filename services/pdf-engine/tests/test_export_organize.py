from __future__ import annotations

import asyncio
import io
import json
import tempfile

import pytest
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader, PdfWriter
from starlette.datastructures import Headers

from app import main


def create_source_pdf(widths: list[int]) -> bytes:
    writer = PdfWriter()
    for width in widths:
        writer.add_blank_page(width=width, height=100)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def create_upload(name: str, widths: list[int]) -> UploadFile:
    upload_content = tempfile.SpooledTemporaryFile()
    upload_content.write(create_source_pdf(widths))
    upload_content.seek(0)
    return UploadFile(
        file=upload_content,
        filename=name,
        headers=Headers({"content-type": "application/pdf"}),
    )


def export_pdf(plan: dict[str, object], source_documents: dict[str, list[int]]):
    document_ids = list(source_documents)
    files = [create_upload(f"{document_id}.pdf", widths) for document_id, widths in source_documents.items()]
    return asyncio.run(
        main.export_organize_pdf(
            plan=json.dumps(plan),
            files=files,
            document_ids=json.dumps(document_ids),
        )
    )


def read_exported_pdf(response_content: bytes) -> PdfReader:
    return PdfReader(io.BytesIO(response_content))


def page_widths(reader: PdfReader) -> list[int]:
    return [int(page.mediabox.width) for page in reader.pages]


def test_exports_a_single_document_in_the_original_order() -> None:
    response = export_pdf(
        {
            "pages": [
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 0},
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 1},
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 2},
            ]
        },
        {"doc-a": [100, 200, 300]},
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert page_widths(read_exported_pdf(response.body)) == [100, 200, 300]


def test_keeps_the_legacy_single_file_export_compatible() -> None:
    response = asyncio.run(
        main.export_organize_pdf(
            plan=json.dumps({"pages": [{"sourcePageIndex": 1}]}),
            file=create_upload("legacy.pdf", [100, 200]),
        )
    )

    assert page_widths(read_exported_pdf(response.body)) == [200]


def test_exports_reordered_pages_from_multiple_documents() -> None:
    response = export_pdf(
        {
            "pages": [
                {"sourceDocumentId": "doc-b", "sourcePageIndex": 0},
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 1},
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 0},
            ]
        },
        {"doc-a": [100, 200], "doc-b": [300]},
    )

    assert page_widths(read_exported_pdf(response.body)) == [300, 200, 100]


def test_duplicates_and_rotates_a_page_from_another_document() -> None:
    response = export_pdf(
        {
            "pages": [
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 0},
                {"sourceDocumentId": "doc-b", "sourcePageIndex": 0, "rotation": 90},
                {"sourceDocumentId": "doc-b", "sourcePageIndex": 0, "rotation": 90},
            ]
        },
        {"doc-a": [100], "doc-b": [300]},
    )

    reader = read_exported_pdf(response.body)
    assert page_widths(reader) == [100, 300, 300]
    assert [reader.pages[index].rotation for index in (1, 2)] == [90, 90]


def test_rejects_an_empty_plan() -> None:
    with pytest.raises(HTTPException) as error:
        export_pdf({"pages": []}, {"doc-a": [100]})

    assert error.value.status_code == 422
    assert error.value.detail == "Le plan d'organisation ne contient aucune page."


def test_rejects_an_unknown_source_document() -> None:
    with pytest.raises(HTTPException) as error:
        export_pdf({"pages": [{"sourceDocumentId": "doc-b", "sourcePageIndex": 0}]}, {"doc-a": [100]})

    assert error.value.status_code == 422
    assert error.value.detail == "Le document source 'doc-b' est introuvable."


def test_rejects_an_invalid_page_index() -> None:
    with pytest.raises(HTTPException) as error:
        export_pdf({"pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 3}]}, {"doc-a": [100]})

    assert error.value.status_code == 422
    assert error.value.detail == "L'index de page 3 est invalide pour le document 'doc-a'."


def test_writes_a_non_overwriting_copy_to_the_output_directory(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(main, "OUTPUT_DIR", tmp_path)
    (tmp_path / "organise.pdf").write_bytes(b"existing")
    response = export_pdf(
        {
            "outputName": "organise.pdf",
            "saveToOutputDir": True,
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
        },
        {"doc-a": [100]},
    )

    assert response.status_code == 200
    assert response.headers["x-pdf-output-status"] == "saved"
    assert (tmp_path / "organise-1.pdf").read_bytes() == response.body


def test_does_not_touch_the_output_directory_when_copy_is_disabled(tmp_path, monkeypatch) -> None:
    output_dir = tmp_path / "not-created"
    monkeypatch.setattr(main, "OUTPUT_DIR", output_dir)
    response = export_pdf(
        {"pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}]},
        {"doc-a": [100]},
    )

    assert response.status_code == 200
    assert not output_dir.exists()


def test_creates_the_output_directory_and_sanitizes_the_output_name(tmp_path, monkeypatch) -> None:
    output_dir = tmp_path / "created-on-demand"
    monkeypatch.setattr(main, "OUTPUT_DIR", output_dir)
    response = export_pdf(
        {
            "outputName": "rapport?.pdf",
            "saveToOutputDir": True,
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
        },
        {"doc-a": [100]},
    )

    assert response.status_code == 200
    assert (output_dir / "rapport-.pdf").read_bytes() == response.body


def test_returns_the_pdf_when_the_development_copy_cannot_be_written(tmp_path, monkeypatch) -> None:
    blocked_output = tmp_path / "blocked-output"
    blocked_output.write_text("not a directory")
    monkeypatch.setattr(main, "OUTPUT_DIR", blocked_output)
    response = export_pdf(
        {
            "saveToOutputDir": True,
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
        },
        {"doc-a": [100]},
    )

    assert response.status_code == 200
    assert response.headers["x-pdf-output-status"] == "warning"
    assert "téléchargé" in response.headers["x-pdf-output-warning"]
    assert page_widths(read_exported_pdf(response.body)) == [100]

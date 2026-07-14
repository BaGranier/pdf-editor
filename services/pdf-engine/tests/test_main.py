from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from pypdf import PdfReader, PdfWriter
from app import main


def make_pdf(page_count: int = 1, *, encrypted: bool = False) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=200, height=200)

    if encrypted:
        writer.encrypt("secret")

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class InMemoryUpload:
    def __init__(self, content: bytes, name: str = "source.pdf") -> None:
        self.content = content
        self.content_type = "application/pdf"
        self.filename = name

    async def read(self) -> bytes:
        return self.content


def make_upload(content: bytes, name: str = "source.pdf") -> InMemoryUpload:
    return InMemoryUpload(content, name)


def make_plan(pages: list[dict[str, object]], **extra: object) -> str:
    return json.dumps({"pages": pages, **extra})


def test_build_output_name_rejects_empty_and_path_values() -> None:
    for value in ("", "../document.pdf", "/tmp/document.pdf", r"C:\\document.pdf"):
        with pytest.raises(HTTPException, match="nom de sortie"):
            main.build_output_name("source.pdf", value)


def test_build_output_name_normalizes_missing_extension() -> None:
    assert main.build_output_name("source.pdf", "export final") == "export final.pdf"
    assert main.build_output_name("source.pdf", None) == "source-modifie.pdf"


def test_parse_document_ids_rejects_invalid_collections() -> None:
    for value in (None, "not-json", '["doc-a", "doc-a"]', '["doc-a"]'):
        with pytest.raises(HTTPException, match="identifiants"):
            main.parse_document_ids(value, 2)

    assert main.parse_document_ids(None, 1) == ["active-document"]


def test_parse_plan_rejects_invalid_page_indexes_and_rotations() -> None:
    for plan in (
        make_plan([{"sourcePageIndex": -1}]),
        make_plan([{"sourcePageIndex": 0, "rotation": 45}]),
        "not-json",
    ):
        with pytest.raises(HTTPException, match="plan d'organisation"):
            main.parse_organize_plan(plan)


def test_export_rejects_empty_plan_unknown_source_and_invalid_page_index() -> None:
    source = {"doc-a": make_pdf()}

    with pytest.raises(HTTPException, match="aucune page"):
        main.export_organized_pdf(source, main.parse_organize_plan(make_plan([])))

    with pytest.raises(HTTPException, match="introuvable"):
        main.export_organized_pdf(
            source,
            main.parse_organize_plan(make_plan([{"sourceDocumentId": "doc-b", "sourcePageIndex": 0}])),
        )

    with pytest.raises(HTTPException, match="index de page"):
        main.export_organized_pdf(
            source,
            main.parse_organize_plan(make_plan([{"sourceDocumentId": "doc-a", "sourcePageIndex": 1}])),
        )


def test_export_rejects_invalid_and_encrypted_pdf_sources() -> None:
    with pytest.raises(HTTPException, match="PDF valide"):
        main.export_organized_pdf(
            {"doc-a": b"not a pdf"},
            main.parse_organize_plan(make_plan([{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}])),
        )

    with pytest.raises(HTTPException, match="protégés"):
        main.export_organized_pdf(
            {"doc-a": make_pdf(encrypted=True)},
            main.parse_organize_plan(make_plan([{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}])),
        )


def test_export_supports_alternating_multi_source_pages_and_duplicates() -> None:
    result = main.export_organized_pdf(
        {"doc-a": make_pdf(2), "doc-b": make_pdf(1)},
        main.parse_organize_plan(
            make_plan(
                [
                    {"sourceDocumentId": "doc-b", "sourcePageIndex": 0},
                    {"sourceDocumentId": "doc-a", "sourcePageIndex": 1, "rotation": 90},
                    {"sourceDocumentId": "doc-b", "sourcePageIndex": 0},
                ],
            ),
        ),
    )

    reader = PdfReader(io.BytesIO(result))
    assert len(reader.pages) == 3
    assert reader.pages[1].rotation == 90


def test_get_output_path_creates_directory_and_avoids_conflicts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    output_dir = tmp_path / "output"
    monkeypatch.setattr(main, "OUTPUT_DIR", output_dir)
    output_dir.mkdir()
    (output_dir / "export.pdf").write_bytes(b"existing")

    output_path = main.get_output_path("export.pdf")

    assert output_path == output_dir / "export-1.pdf"


def test_endpoint_saves_output_and_keeps_download_response(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "OUTPUT_DIR", tmp_path / "output")
    response = asyncio.run(
        main.export_organize_pdf(
            plan=make_plan(
                [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
                outputName="saved",
                saveToOutputDir=True,
            ),
            files=[make_upload(make_pdf())],
            document_ids='["doc-a"]',
        ),
    )

    assert response.media_type == "application/pdf"
    assert response.headers["x-pdf-output-status"] == "saved"
    assert (tmp_path / "output" / "saved.pdf").read_bytes() == response.body


def test_endpoint_returns_download_when_output_copy_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_output_path(_: str) -> Path:
        raise OSError("disk unavailable")

    monkeypatch.setattr(main, "get_output_path", fail_output_path)
    response = asyncio.run(
        main.export_organize_pdf(
            plan=make_plan(
                [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
                saveToOutputDir=True,
            ),
            files=[make_upload(make_pdf())],
            document_ids='["doc-a"]',
        ),
    )

    assert response.body
    assert response.headers["x-pdf-output-status"] == "warning"
    assert "téléchargé" in response.headers["x-pdf-output-warning"]

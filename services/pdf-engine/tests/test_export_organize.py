from __future__ import annotations

import asyncio
import base64
import io
import json
import tempfile

import fitz
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


def extracted_page_texts(content: bytes) -> list[str]:
    with fitz.open(stream=content, filetype="pdf") as document:
        return [page.get_text() for page in document]


def create_signature_data_url(mime_type: str, *, transparent: bool = False) -> str:
    if mime_type == "image/png":
        pixmap = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 2, 1), True)
        pixmap.set_pixel(0, 0, (8, 8, 8, 255))
        pixmap.set_pixel(1, 0, (8, 8, 8, 0 if transparent else 255))
        content = pixmap.tobytes("png")
    else:
        pixmap = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 2, 1), False)
        pixmap.set_pixel(0, 0, (8, 8, 8))
        pixmap.set_pixel(1, 0, (245, 245, 245))
        content = pixmap.tobytes("jpg")
    return f"data:{mime_type};base64,{base64.b64encode(content).decode()}"


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


def test_embeds_multiple_text_blocks_with_styles_and_french_characters() -> None:
    response = export_pdf(
        {
            "pages": [
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 0},
            ],
            "edits": [
                {
                    "id": "title",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "rect": {"x0": 20, "y0": 52, "x1": 280, "y1": 90},
                    "text": "Été 2026 : 42,50 !",
                    "style": {
                        "fontFamily": "Helvetica",
                        "fontSize": 12,
                        "color": "#C026D3",
                        "bold": True,
                    },
                },
                {
                    "id": "note",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "rect": {"x0": 20, "y0": 12, "x1": 280, "y1": 48},
                    "text": "Deuxième bloc.",
                    "style": {
                        "fontFamily": "Courier",
                        "fontSize": 10,
                        "color": "#123456",
                    },
                },
            ],
        },
        {"doc-a": [300]},
    )

    assert response.status_code == 200
    result = response.body

    assert extracted_page_texts(result) == ["Été 2026 : 42,50 !\nDeuxième bloc.\n"]
    with fitz.open(stream=result, filetype="pdf") as document:
        spans = [
            span
            for block in document[0].get_text("dict")["blocks"]
            for line in block.get("lines", [])
            for span in line["spans"]
        ]
    assert spans[0]["font"] == "Helvetica-Bold"
    assert spans[0]["color"] == int("C026D3", 16)
    assert spans[0]["size"] == pytest.approx(12)
    assert spans[0]["bbox"][0] == pytest.approx(20, abs=0.5)
    assert spans[0]["bbox"][1] == pytest.approx(10, abs=1)
    assert spans[1]["font"] == "Courier"


def test_applies_text_to_reordered_duplicated_and_rotated_output_pages() -> None:
    source_a = create_source_pdf([200, 300])
    source_b = create_source_pdf([400])
    original_a = bytes(source_a)
    original_b = bytes(source_b)
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [
                {
                    "sourceDocumentId": "doc-b",
                    "sourcePageIndex": 0,
                    "rotation": 90,
                },
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 1},
                {"sourceDocumentId": "doc-b", "sourcePageIndex": 0},
            ],
            "edits": [
                {
                    "id": "a-page-2",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 2,
                    "rect": {"x0": 10, "y0": 50, "x1": 260, "y1": 90},
                    "text": "Page paysage A2",
                    "style": {
                        "fontFamily": "Times",
                        "fontSize": 11,
                        "color": "#000000",
                    },
                },
                {
                    "id": "b-page-1",
                    "type": "add_text",
                    "sourceDocumentId": "doc-b",
                    "page": 1,
                    "rect": {"x0": 10, "y0": 50, "x1": 360, "y1": 90},
                    "text": "Texte dupliqué B1",
                    "style": {
                        "fontFamily": "Helvetica",
                        "fontSize": 11,
                        "color": "#000000",
                    },
                },
            ],
        }
    )

    result = main.export_organized_pdf(
        {"doc-a": source_a, "doc-b": source_b},
        plan,
    )

    assert extracted_page_texts(result) == [
        "Texte dupliqué B1\n",
        "Page paysage A2\n",
        "Texte dupliqué B1\n",
    ]
    assert PdfReader(io.BytesIO(result)).pages[0].rotation == 90
    assert source_a == original_a
    assert source_b == original_b


def test_embeds_png_and_jpeg_signatures_on_multiple_pages_without_changing_sources() -> (
    None
):
    source_a = create_source_pdf([200, 300])
    source_b = create_source_pdf([400])
    original_a = bytes(source_a)
    original_b = bytes(source_b)
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [
                {
                    "sourceDocumentId": "doc-b",
                    "sourcePageIndex": 0,
                    "rotation": 90,
                },
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 1},
                {"sourceDocumentId": "doc-b", "sourcePageIndex": 0},
            ],
            "signatures": [
                {
                    "id": "signature-png",
                    "type": "signature",
                    "sourceDocumentId": "doc-a",
                    "page": 2,
                    "rect": {"x0": 20, "y0": 20, "x1": 120, "y1": 70},
                    "imageId": "png-transparent",
                },
                {
                    "id": "signature-jpeg",
                    "type": "signature",
                    "sourceDocumentId": "doc-b",
                    "page": 1,
                    "rect": {"x0": 10, "y0": 10, "x1": 110, "y1": 60},
                    "imageId": "jpeg-signature",
                },
            ],
            "signatureImages": [
                {
                    "id": "png-transparent",
                    "mimeType": "image/png",
                    "dataUrl": create_signature_data_url(
                        "image/png",
                        transparent=True,
                    ),
                    "width": 2,
                    "height": 1,
                },
                {
                    "id": "jpeg-signature",
                    "mimeType": "image/jpeg",
                    "dataUrl": create_signature_data_url("image/jpeg"),
                    "width": 2,
                    "height": 1,
                },
            ],
        }
    )

    result = main.export_organized_pdf(
        {"doc-a": source_a, "doc-b": source_b},
        plan,
    )

    with fitz.open(stream=result, filetype="pdf") as document:
        assert [len(page.get_images(full=True)) for page in document] == [1, 1, 1]
        png_image = document[1].get_images(full=True)[0]
        assert png_image[1] > 0  # soft mask preserving the transparent pixels
        png_rect = document[1].get_image_rects(png_image[0])[0]
        assert png_rect == fitz.Rect(20, 30, 120, 80)
    assert PdfReader(io.BytesIO(result)).pages[0].rotation == 90
    assert source_a == original_a
    assert source_b == original_b


def test_exports_text_and_signatures_together_on_multiple_rotated_pages() -> None:
    source = create_source_pdf([240, 320])
    original = bytes(source)
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [
                {"sourceDocumentId": "doc-a", "sourcePageIndex": 0},
                {
                    "sourceDocumentId": "doc-a",
                    "sourcePageIndex": 1,
                    "rotation": 90,
                },
            ],
            "edits": [
                {
                    "id": "text-page-1",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "order": 0,
                    "rect": {"x0": 15, "y0": 50, "x1": 225, "y1": 90},
                    "text": "Texte + signature page 1",
                    "style": {
                        "fontFamily": "Helvetica",
                        "fontSize": 11,
                        "color": "#C026D3",
                    },
                },
                {
                    "id": "text-page-2",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 2,
                    "order": 1,
                    "rect": {"x0": 15, "y0": 50, "x1": 305, "y1": 90},
                    "text": "Texte + signature page 2",
                    "style": {
                        "fontFamily": "Times",
                        "fontSize": 11,
                        "color": "#123456",
                    },
                },
            ],
            "signatures": [
                {
                    "id": "signature-page-1",
                    "type": "signature",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "order": 1,
                    "rect": {"x0": 20, "y0": 10, "x1": 120, "y1": 40},
                    "imageId": "png-transparent",
                },
                {
                    "id": "signature-page-2",
                    "type": "signature",
                    "sourceDocumentId": "doc-a",
                    "page": 2,
                    "order": 0,
                    "rect": {"x0": 30, "y0": 10, "x1": 150, "y1": 40},
                    "imageId": "jpeg-signature",
                },
            ],
            "signatureImages": [
                {
                    "id": "png-transparent",
                    "mimeType": "image/png",
                    "dataUrl": create_signature_data_url(
                        "image/png",
                        transparent=True,
                    ),
                    "width": 2,
                    "height": 1,
                },
                {
                    "id": "jpeg-signature",
                    "mimeType": "image/jpeg",
                    "dataUrl": create_signature_data_url("image/jpeg"),
                    "width": 2,
                    "height": 1,
                },
            ],
        }
    )

    result = main.export_organized_pdf({"doc-a": source}, plan)

    assert extracted_page_texts(result) == [
        "Texte + signature page 1\n",
        "Texte + signature page 2\n",
    ]
    with fitz.open(stream=result, filetype="pdf") as document:
        assert [len(page.get_images(full=True)) for page in document] == [1, 1]
        assert document[0].get_images(full=True)[0][1] > 0
    assert PdfReader(io.BytesIO(result)).pages[1].rotation == 90
    assert source == original


def test_applies_overlapping_visual_edits_in_their_explicit_order() -> None:
    image = {
        "id": "opaque",
        "mimeType": "image/png",
        "dataUrl": create_signature_data_url("image/png"),
        "width": 2,
        "height": 1,
    }

    def export_with_orders(text_order: int, signature_order: int) -> bytes:
        plan = main.OrganizeExportPlan.model_validate(
            {
                "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
                "edits": [
                    {
                        "id": "overlapping-text",
                        "type": "add_text",
                        "sourceDocumentId": "doc-a",
                        "page": 1,
                        "order": text_order,
                        "rect": {"x0": 20, "y0": 10, "x1": 180, "y1": 90},
                        "text": "CORE",
                        "style": {
                            "fontFamily": "Helvetica",
                            "fontSize": 28,
                            "color": "#FF0000",
                            "bold": True,
                        },
                    }
                ],
                "signatures": [
                    {
                        "id": "overlapping-signature",
                        "type": "signature",
                        "sourceDocumentId": "doc-a",
                        "page": 1,
                        "order": signature_order,
                        "rect": {"x0": 20, "y0": 10, "x1": 180, "y1": 90},
                        "imageId": "opaque",
                    }
                ],
                "signatureImages": [image],
            }
        )
        return main.export_organized_pdf({"doc-a": create_source_pdf([200])}, plan)

    def red_pixel_count(content: bytes) -> int:
        with fitz.open(stream=content, filetype="pdf") as document:
            pixmap = document[0].get_pixmap(
                matrix=fitz.Matrix(2, 2),
                alpha=False,
            )
        samples = pixmap.samples
        return sum(
            1
            for index in range(0, len(samples), pixmap.n)
            if samples[index] > 180
            and samples[index + 1] < 100
            and samples[index + 2] < 100
        )

    signature_then_text = export_with_orders(text_order=1, signature_order=0)
    text_then_signature = export_with_orders(text_order=0, signature_order=1)

    assert red_pixel_count(signature_then_text) > 0
    assert red_pixel_count(text_then_signature) == 0


def test_rejects_a_signature_with_a_missing_or_invalid_image() -> None:
    missing_image_plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
            "signatures": [
                {
                    "id": "missing",
                    "type": "signature",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "rect": {"x0": 10, "y0": 10, "x1": 60, "y1": 40},
                    "imageId": "unknown",
                }
            ],
        }
    )

    with pytest.raises(HTTPException) as missing_error:
        main.export_organized_pdf(
            {"doc-a": create_source_pdf([100])},
            missing_image_plan,
        )
    assert missing_error.value.status_code == 422
    assert "introuvable" in missing_error.value.detail

    invalid_image_plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
            "signatureImages": [
                {
                    "id": "invalid",
                    "mimeType": "image/png",
                    "dataUrl": "data:image/png;base64,bm90IGEgcG5n",
                    "width": 2,
                    "height": 1,
                }
            ],
        }
    )

    with pytest.raises(HTTPException) as invalid_error:
        main.export_organized_pdf(
            {"doc-a": create_source_pdf([100])},
            invalid_image_plan,
        )
    assert invalid_error.value.status_code == 422
    assert "format" in invalid_error.value.detail


def test_rejects_an_add_text_rectangle_that_cannot_contain_its_text() -> None:
    plan = main.OrganizeExportPlan.model_validate(
        {
            "pages": [{"sourceDocumentId": "doc-a", "sourcePageIndex": 0}],
            "edits": [
                {
                    "id": "too-small",
                    "type": "add_text",
                    "sourceDocumentId": "doc-a",
                    "page": 1,
                    "rect": {"x0": 10, "y0": 80, "x1": 20, "y1": 90},
                    "text": "Texte beaucoup trop long",
                    "style": {
                        "fontFamily": "Helvetica",
                        "fontSize": 18,
                        "color": "#000000",
                    },
                }
            ],
        }
    )

    with pytest.raises(HTTPException) as error:
        main.export_organized_pdf({"doc-a": create_source_pdf([100])}, plan)

    assert error.value.status_code == 422
    assert "trop petit" in error.value.detail


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

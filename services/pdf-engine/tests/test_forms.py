from __future__ import annotations

import asyncio
import io
import tempfile

import fitz
import pytest
from pypdf import PdfReader
from starlette.datastructures import Headers
from fastapi import UploadFile

from app import main


def make_acroform_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    name = fitz.Widget()
    name.field_name = "person.name"
    name.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    name.field_value = "Jean"
    name.rect = fitz.Rect(20, 20, 220, 48)
    page.add_widget(name)
    required = fitz.Widget()
    required.field_name = "person.required"
    required.field_type = fitz.PDF_WIDGET_TYPE_TEXT
    required.field_flags = 2
    required.rect = fitz.Rect(20, 70, 220, 98)
    page.add_widget(required)
    checkbox = fitz.Widget()
    checkbox.field_name = "options.newsletter"
    checkbox.field_type = fitz.PDF_WIDGET_TYPE_CHECKBOX
    checkbox.field_value = "Yes"
    checkbox.rect = fitz.Rect(20, 120, 42, 142)
    page.add_widget(checkbox)
    return document.tobytes()


def make_upload(source: bytes) -> UploadFile:
    temporary = tempfile.SpooledTemporaryFile()
    temporary.write(source)
    temporary.seek(0)
    return UploadFile(file=temporary, filename="form.pdf", headers=Headers({"content-type": "application/pdf"}))


def test_extracts_page_scoped_acroform_widgets() -> None:
    response = asyncio.run(main.extract_pdf_form_fields(make_upload(make_acroform_pdf()), 0))
    assert [field.name for field in response["fields"]] == ["person.name", "person.required", "options.newsletter"]
    assert [field.field_type for field in response["fields"]] == ["text", "text", "checkbox"]
    assert response["fields"][0].value == "Jean"
    assert response["fields"][1].required is True


def test_exports_values_without_flattening_the_acroform() -> None:
    source = make_acroform_pdf()
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "formValues": [
            {"page": 1, "fieldName": "person.name", "value": "Alice"},
            {"page": 1, "fieldName": "options.newsletter", "value": "Off"},
        ],
    })
    exported = main.export_organized_pdf({"document-1": source}, plan)
    reader = PdfReader(io.BytesIO(exported))
    fields = reader.get_fields()
    assert fields is not None
    assert fields["person.name"]["/V"] == "Alice"
    assert str(fields["options.newsletter"]["/V"]) == "/Off"
    with fitz.open(stream=exported, filetype="pdf") as document:
        assert len(list(document[0].widgets() or [])) == 3


def test_rejects_form_updates_when_pages_are_reorganized() -> None:
    document = fitz.open(stream=make_acroform_pdf(), filetype="pdf")
    document.new_page()
    source = document.tobytes()
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 1}, {"sourcePageIndex": 0}],
        "formValues": [{"page": 1, "fieldName": "person.name", "value": "Alice"}],
    })
    with pytest.raises(main.HTTPException, match="ne sont pas réorganisées"):
        main.export_organized_pdf({"document-1": source}, plan)

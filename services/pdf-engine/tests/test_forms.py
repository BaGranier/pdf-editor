from __future__ import annotations

import asyncio
import io
import tempfile

import fitz
import pytest
from pypdf import PdfReader
from pypdf import PdfWriter
from pypdf.generic import (
    ArrayObject,
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
    NumberObject,
    TextStringObject,
)
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


def make_radio_pdf() -> bytes:
    """Synthetic AcroForm radio group with per-widget appearance names."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=100, height=100)
    parent = DictionaryObject({
        NameObject("/FT"): NameObject("/Btn"),
        NameObject("/Ff"): NumberObject(1 << 15),
        NameObject("/T"): TextStringObject("plan.level"),
        NameObject("/V"): NameObject("/standard"),
    })
    parent_ref = writer._add_object(parent)
    annotations = ArrayObject()
    children = ArrayObject()
    for option, rect in (("standard", (10, 10, 20, 20)), ("pro", (30, 10, 40, 20))):
        appearance_stream = DecodedStreamObject()
        appearance_stream.set_data(b"")
        widget = DictionaryObject({
            NameObject("/Type"): NameObject("/Annot"),
            NameObject("/Subtype"): NameObject("/Widget"),
            NameObject("/Parent"): parent_ref,
            NameObject("/Rect"): ArrayObject([NumberObject(value) for value in rect]),
            NameObject("/AP"): DictionaryObject({
                NameObject("/N"): DictionaryObject({
                    NameObject("/Off"): appearance_stream,
                    NameObject(f"/{option}"): appearance_stream,
                }),
            }),
            NameObject("/AS"): NameObject("/standard" if option == "standard" else "/Off"),
        })
        widget_ref = writer._add_object(widget)
        annotations.append(widget_ref)
        children.append(widget_ref)
    parent[NameObject("/Kids")] = children
    page[NameObject("/Annots")] = annotations
    writer._root_object[NameObject("/AcroForm")] = DictionaryObject({
        NameObject("/Fields"): ArrayObject([parent_ref]),
    })
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


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


def test_exports_checkbox_value_and_appearance_state() -> None:
    source = make_acroform_pdf()
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "formValues": [{"page": 1, "fieldName": "options.newsletter", "value": "Yes"}],
    })

    exported = main.export_organized_pdf({"document-1": source}, plan)
    reader = PdfReader(io.BytesIO(exported))
    fields = reader.get_fields()
    assert fields is not None
    assert str(fields["options.newsletter"]["/V"]) == "/Yes"
    widget = next(
        annotation.get_object()
        for annotation in reader.pages[0]["/Annots"]
        if annotation.get_object().get("/T") == "options.newsletter"
    )
    assert str(widget["/AS"]) == "/Yes"
    with fitz.open(stream=exported, filetype="pdf") as document:
        newsletter = next(widget for widget in document[0].widgets() or [] if widget.field_name == "options.newsletter")
        assert newsletter.field_value == "Yes"


def test_synchronizes_each_radio_widget_appearance_with_the_selected_export_value() -> None:
    parent = {"/T": "plan.level", "/FT": "/Btn"}
    standard = {
        "/Subtype": "/Widget",
        "/Parent": parent,
        "/AP": {"/N": {NameObject("/Off"): {}, NameObject("/standard"): {}}},
        "/AS": NameObject("/standard"),
    }
    pro = {
        "/Subtype": "/Widget",
        "/Parent": parent,
        "/AP": {"/N": {NameObject("/Off"): {}, NameObject("/pro"): {}}},
        "/AS": NameObject("/Off"),
    }
    page = {"/Annots": [standard, pro]}

    assert main._apply_button_value(page, "plan.level", "pro") is True
    assert str(parent["/V"]) == "/pro"
    assert str(standard["/AS"]) == "/Off"
    assert str(pro["/AS"]) == "/pro"


def test_exports_radio_value_and_widget_appearances_after_reopening() -> None:
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "formValues": [{"page": 1, "fieldName": "plan.level", "value": "pro"}],
    })
    exported = main.export_organized_pdf({"document-1": make_radio_pdf()}, plan)
    reader = PdfReader(io.BytesIO(exported))
    fields = reader.get_fields()
    assert fields is not None
    assert str(fields["plan.level"]["/V"]) == "/pro"
    appearances = [str(annotation.get_object()["/AS"]) for annotation in reader.pages[0]["/Annots"]]
    assert appearances == ["/Off", "/pro"]


def test_locks_acroform_fields_without_flattening_or_changing_values() -> None:
    source = make_acroform_pdf()
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "formValues": [
            {"page": 1, "fieldName": "person.name", "value": "Alice"},
            {"page": 1, "fieldName": "options.newsletter", "value": "Off"},
        ],
        "formLocks": [{"locked": True}],
    })

    exported = main.export_organized_pdf({"document-1": source}, plan)
    reader = PdfReader(io.BytesIO(exported))
    fields = reader.get_fields()
    assert fields is not None
    assert fields["person.name"]["/V"] == "Alice"
    assert str(fields["options.newsletter"]["/V"]) == "/Off"
    assert all(int(fields[name].get("/Ff", 0)) & 1 for name in fields)
    widget = next(
        annotation.get_object()
        for annotation in reader.pages[0]["/Annots"]
        if annotation.get_object().get("/T") == "options.newsletter"
    )
    assert str(widget["/AS"]) == "/Off"
    with fitz.open(stream=exported, filetype="pdf") as document:
        widgets = list(document[0].widgets() or [])
        assert len(widgets) == 3
        assert all(widget.field_flags & 1 for widget in widgets)


def test_locks_radio_parent_without_changing_button_appearance_states() -> None:
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "formLocks": [{"locked": True}],
    })
    exported = main.export_organized_pdf({"document-1": make_radio_pdf()}, plan)
    reader = PdfReader(io.BytesIO(exported))
    fields = reader.get_fields()
    assert fields is not None
    assert str(fields["plan.level"]["/V"]) == "/standard"
    assert int(fields["plan.level"].get("/Ff", 0)) & 1
    appearances = [str(annotation.get_object()["/AS"]) for annotation in reader.pages[0]["/Annots"]]
    assert appearances == ["/standard", "/Off"]


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


def test_rejects_form_lock_when_pages_are_reorganized() -> None:
    document = fitz.open(stream=make_acroform_pdf(), filetype="pdf")
    document.new_page()
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 1}, {"sourcePageIndex": 0}],
        "formLocks": [{"locked": True}],
    })
    with pytest.raises(main.HTTPException, match="verrouillage AcroForm"):
        main.export_organized_pdf({"document-1": document.tobytes()}, plan)

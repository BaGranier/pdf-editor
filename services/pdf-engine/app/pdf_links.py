from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Callable
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pypdf import PageObject, PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    Destination,
    DictionaryObject,
    FloatObject,
    IndirectObject,
    NameObject,
    NullObject,
    PdfObject,
    TextStringObject,
)


class PdfEditRect(BaseModel):
    x0: float = Field(allow_inf_nan=False)
    y0: float = Field(allow_inf_nan=False)
    x1: float = Field(allow_inf_nan=False)
    y1: float = Field(allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_dimensions(self) -> "PdfEditRect":
        if self.x1 <= self.x0 or self.y1 <= self.y0:
            raise ValueError("Le rectangle d'édition doit avoir une surface positive.")
        return self


class WebDestination(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["uri"]
    url: str = Field(min_length=1, max_length=4096)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        try:
            parsed = urlsplit(value)
            _ = parsed.port
            if (
                re.match(r"^https?://", value, re.IGNORECASE)
                and not re.search(r"[\x00-\x20\x7f\\]", value)
                and parsed.hostname
                and not re.search(r"[%\s<>^|`]", parsed.hostname)
                and parsed.username is None
                and parsed.password is None
            ):
                return value
        except ValueError:
            pass
        raise ValueError("Seules les URL HTTP et HTTPS valides sont autorisées.")


class InternalDestination(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["internal"]
    page_index: int = Field(alias="pageIndex", ge=0, strict=True)
    x: float | None = Field(default=None, allow_inf_nan=False)
    y: float | None = Field(default=None, allow_inf_nan=False)


class PdfLinkEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_document_id: str = Field(alias="sourceDocumentId", min_length=1)
    page: int = Field(ge=1, strict=True)
    rect: PdfEditRect
    areas: list[PdfEditRect] = Field(default_factory=list, max_length=256)
    source_xref: int | None = Field(default=None, alias="sourceXref", gt=0, strict=True)
    destination: (
        Annotated[WebDestination | InternalDestination, Field(discriminator="kind")]
        | None
    )
    label: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def validate_deletion(self) -> PdfLinkEdit:
        if self.destination is None and self.source_xref is None:
            raise ValueError("La suppression doit cibler une annotation source.")
        return self


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


def _native_box(page: PageObject) -> tuple[float, float, float, float]:
    crop, media = page.cropbox, page.mediabox
    x0, y0 = max(crop.left, media.left), max(crop.bottom, media.bottom)
    x1, y1 = min(crop.right, media.right), min(crop.top, media.top)
    if x0 >= x1 or y0 >= y1:
        return tuple(media)
    return x0, y0, x1, y1


def _action(annotation: DictionaryObject) -> DictionaryObject:
    action = annotation.get("/A")
    resolved = action.get_object() if action is not None else None
    return resolved if isinstance(resolved, DictionaryObject) else DictionaryObject()


def _internal_destination(
    annotation: DictionaryObject, action: DictionaryObject
) -> PdfObject | None:
    if action.get("/S") == "/GoTo":
        return action.get("/D")
    if not action:
        return annotation.get("/Dest")
    return None


def _supported_edit(annotation: DictionaryObject) -> bool:
    action = _action(annotation)
    if "/AA" in annotation or "/Next" in action:
        return False
    if action.get("/S") == "/URI":
        try:
            WebDestination(kind="uri", url=action["/URI"])
        except (ValueError, KeyError):
            return False
        return True
    destination = _internal_destination(annotation, action)
    destination = destination.get_object() if destination is not None else None
    return (
        isinstance(destination, ArrayObject)
        and len(destination) >= 2
        and destination[1] in {"/XYZ", "/Fit"}
    )


def _destination_array(
    raw: PdfObject | None, reader: PdfReader, named_destinations: dict[str, Destination]
) -> tuple[int, ArrayObject] | None:
    value = raw.get_object() if raw is not None else None
    if isinstance(value, str):
        named = named_destinations.get(value) or named_destinations.get(
            value.lstrip("/")
        )
        value = named.dest_array if named else None
    if not isinstance(value, ArrayObject) or len(value) < 2:
        return None
    target = value[0]
    if isinstance(target, IndirectObject):
        index = reader.get_page_number(target.get_object())
    elif isinstance(target, int):
        index = target
    else:
        return None
    return (
        (index, value)
        if isinstance(index, int) and 0 <= index < len(reader.pages)
        else None
    )


def apply_pdf_links(
    writer: PdfWriter,
    readers: dict[str, PdfReader],
    output_sources: list[tuple[str, int]],
    edits: list[PdfLinkEdit],
    preserve_catalog: bool,
) -> None:
    if preserve_catalog and not edits:
        return
    output_indices: dict[tuple[str, int], list[int]] = defaultdict(list)
    for index, key in enumerate(output_sources):
        output_indices[key].append(index)

    by_page: dict[tuple[str, int], list[PdfLinkEdit]] = defaultdict(list)
    for edit in edits:
        source = readers.get(edit.source_document_id)
        key = (edit.source_document_id, edit.page - 1)
        if source is None or key not in output_indices:
            raise _invalid("La page source du lien est absente de l’export.")
        rect = edit.rect
        x0, y0, x1, y1 = _native_box(source.pages[edit.page - 1])
        if not (x0 <= rect.x0 < rect.x1 <= x1 and y0 <= rect.y0 < rect.y1 <= y1):
            raise _invalid("Le rectangle du lien est hors de la page source.")
        if any(
            not (
                rect.x0 <= area.x0 < area.x1 <= rect.x1
                and rect.y0 <= area.y0 < area.y1 <= rect.y1
            )
            for area in edit.areas
        ):
            raise _invalid("Une zone du lien dépasse son rectangle.")
        destination = edit.destination
        if isinstance(destination, InternalDestination):
            target = (edit.source_document_id, destination.page_index)
            if target not in output_indices:
                raise _invalid("La page cible du lien est absente de l’export.")
            x0, y0, x1, y1 = _native_box(source.pages[destination.page_index])
            if (destination.x is not None and not x0 <= destination.x <= x1) or (
                destination.y is not None and not y0 <= destination.y <= y1
            ):
                raise _invalid("La position cible du lien est hors de la page.")
        by_page[key].append(edit)

    named_by_source: dict[str, dict[str, Destination]] = {}
    for output_index, key in enumerate(output_sources):
        changes = by_page.get(key, [])
        if preserve_catalog and not changes:
            continue
        source_id, source_index = key
        reader = readers[source_id]
        source_page = reader.pages[source_index]
        output_page = writer.pages[output_index]
        pending = {
            edit.source_xref: edit for edit in changes if edit.source_xref is not None
        }
        if len(pending) != sum(edit.source_xref is not None for edit in changes):
            raise _invalid("Le même lien source est modifié plusieurs fois.")

        def target_ref(target_index: int) -> IndirectObject | None:
            matches = output_indices.get((source_id, target_index))
            if not matches:
                return None
            selected = output_index if target_index == source_index else matches[0]
            return writer.pages[selected].indirect_reference

        originals = source_page.annotations or []
        copies = output_page.annotations or []
        retained = ArrayObject()
        replacements: list[DictionaryObject] = []
        for original_ref, copy_ref in zip(originals, copies, strict=True):
            original = original_ref.get_object()
            if (
                not isinstance(original, DictionaryObject)
                or original.get("/Subtype") != "/Link"
            ):
                retained.append(copy_ref)
                continue
            xref = (
                original_ref.idnum
                if isinstance(original_ref, IndirectObject)
                and original_ref.generation == 0
                else None
            )
            change = pending.pop(xref, None) if xref is not None else None
            if change is not None:
                if not _supported_edit(original):
                    raise _invalid("Ce type de lien source ne peut pas être modifié.")
                if change.destination is not None:
                    replacement = DictionaryObject(copy_ref.get_object())
                    old_rect = replacement.get("/Rect", [])
                    new_rect = [
                        change.rect.x0,
                        change.rect.y0,
                        change.rect.x1,
                        change.rect.y1,
                    ]
                    if list(old_rect) != new_rect:
                        replacement.pop("/QuadPoints", None)
                    _set_link(replacement, change, target_ref)
                    replacements.append(replacement)
                continue
            original_action = _action(original)
            destination = _internal_destination(original, original_action)
            if preserve_catalog or (
                destination is None and original_action.get("/S") != "/GoTo"
            ):
                retained.append(copy_ref)
                continue
            if source_id not in named_by_source:
                named_by_source[source_id] = reader.named_destinations
            resolved = _destination_array(
                destination, reader, named_by_source[source_id]
            )
            reference = target_ref(resolved[0]) if resolved else None
            if reference is not None and resolved is not None:
                replacement = DictionaryObject(copy_ref.get_object())
                copied_destination = ArrayObject(
                    [reference, *(item.clone(writer) for item in resolved[1][1:])]
                )
                if original_action:
                    action = DictionaryObject(_action(replacement))
                    action[NameObject("/D")] = copied_destination
                    replacement[NameObject("/A")] = action
                else:
                    replacement.pop("/Dest", None)
                    replacement[NameObject("/A")] = DictionaryObject(
                        {
                            NameObject("/S"): NameObject("/GoTo"),
                            NameObject("/D"): copied_destination,
                        }
                    )
                replacements.append(replacement)
        if pending:
            raise _invalid("L’annotation de lien source est introuvable sur la page.")
        if originals:
            output_page[NameObject("/Annots")] = retained
        for change in changes:
            if change.source_xref is None:
                annotation = DictionaryObject(
                    {
                        NameObject("/Type"): NameObject("/Annot"),
                        NameObject("/Subtype"): NameObject("/Link"),
                    }
                )
                _set_link(annotation, change, target_ref)
                replacements.append(annotation)
        for replacement in replacements:
            writer.add_annotation(output_index, replacement)


def _set_link(
    annotation: DictionaryObject,
    edit: PdfLinkEdit,
    target_ref: Callable[[int], IndirectObject | None],
) -> None:
    annotation.pop("/Dest", None)
    annotation.pop("/Contents", None)
    if edit.label:
        annotation[NameObject("/Contents")] = TextStringObject(edit.label)
    annotation[NameObject("/Rect")] = ArrayObject(
        [
            FloatObject(n)
            for n in (edit.rect.x0, edit.rect.y0, edit.rect.x1, edit.rect.y1)
        ]
    )
    if edit.areas:
        annotation[NameObject("/QuadPoints")] = ArrayObject(
            [
                FloatObject(value)
                for area in edit.areas
                for value in (
                    area.x0,
                    area.y1,
                    area.x1,
                    area.y1,
                    area.x0,
                    area.y0,
                    area.x1,
                    area.y0,
                )
            ]
        )
    annotation.setdefault(NameObject("/Border"), ArrayObject([FloatObject(0)] * 3))
    if isinstance(edit.destination, WebDestination):
        action = {
            NameObject("/S"): NameObject("/URI"),
            NameObject("/URI"): TextStringObject(edit.destination.url),
        }
    elif isinstance(edit.destination, InternalDestination):
        reference = target_ref(edit.destination.page_index)
        if reference is None:
            raise _invalid("La page cible du lien est absente de l’export.")
        coordinates = edit.destination.x, edit.destination.y
        destination = ArrayObject([reference, NameObject("/Fit")])
        if any(value is not None for value in coordinates):
            destination = ArrayObject(
                [
                    reference,
                    NameObject("/XYZ"),
                    *(
                        FloatObject(value) if value is not None else NullObject()
                        for value in coordinates
                    ),
                    NullObject(),
                ]
            )
        action = {NameObject("/S"): NameObject("/GoTo"), NameObject("/D"): destination}
    else:
        raise _invalid("La destination de lien est manquante.")
    annotation[NameObject("/A")] = DictionaryObject(action)

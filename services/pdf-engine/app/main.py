from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import logging
import math
import re
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

import fitz
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import (
    BaseModel,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError
from pypdf.generic import NameObject, NumberObject

from app.conversion import router as conversion_router
from app.conversion.errors import ConversionError
from app.ocr import OcrError, router as ocr_router


class HealthResponse(BaseModel):
    status: Literal["ok"]


class OrganizeExportPage(BaseModel):
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    source_page_index: int = Field(alias="sourcePageIndex", ge=0)
    rotation: int = 0

    @field_validator("rotation")
    @classmethod
    def normalize_rotation(cls, value: int) -> int:
        if value % 90 != 0:
            raise ValueError("La rotation doit être un multiple de 90 degrés.")

        return value % 360


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


class PdfEditPoint(BaseModel):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


class AddTextStyle(BaseModel):
    font_family: str = Field(alias="fontFamily", min_length=1, max_length=200)
    font_ref: str | None = Field(default=None, alias="fontRef", max_length=200)
    font_size: float = Field(alias="fontSize", ge=6, le=144, allow_inf_nan=False)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    bold: bool = False
    font_style: Literal["normal", "italic"] = Field(default="normal", alias="fontStyle")


class AddTextEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["add_text"]
    source_document_id: str | None = Field(
        default=None,
        alias="sourceDocumentId",
    )
    page: int = Field(ge=1)
    rect: PdfEditRect
    text: str = Field(max_length=10_000)
    style: AddTextStyle
    order: int = Field(default=0, ge=0)


class NativeTextSource(BaseModel):
    source_id: str = Field(alias="sourceId", min_length=1, max_length=200)
    source_text: str = Field(alias="sourceText", max_length=10_000)
    source_bbox: PdfEditRect = Field(alias="sourceBBox")
    source_origin: PdfEditPoint = Field(alias="sourceOrigin")
    source_font_name: str | None = Field(
        default=None, alias="sourceFontName", max_length=200
    )
    source_font_resource_id: str | None = Field(
        default=None, alias="sourceFontResourceId", max_length=50
    )
    source_font_size: float = Field(alias="sourceFontSize", gt=0, le=1000)
    source_color: str = Field(alias="sourceColor", pattern=r"^#[0-9A-Fa-f]{6}$")
    source_rotation: Literal[0, 90, 180, 270] = Field(alias="sourceRotation")
    source_fingerprint: str = Field(
        alias="sourceFingerprint", pattern=r"^[0-9a-f]{64}$"
    )
    editable: bool = True
    limitation: str | None = None
    limitation_message: str | None = Field(default=None, alias="limitationMessage")


class NativeTextEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["native_text"]
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    page: int = Field(ge=1)
    rect: PdfEditRect
    source: NativeTextSource
    text: str = Field(max_length=10_000)
    style: AddTextStyle
    order: int = Field(default=0, ge=0)


class FontResourcePayload(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    format: Literal["ttf", "otf"]
    file_name: str = Field(alias="fileName", min_length=1, max_length=255)
    data_url: str = Field(alias="dataUrl", min_length=1, max_length=28_000_000)


class NativeTextPreviewPlan(BaseModel):
    page_index: int = Field(alias="pageIndex", ge=0)
    rotation: Literal[0, 90, 180, 270] = 0
    edits: list[NativeTextEdit] = Field(min_length=1, max_length=100)
    font_resources: list[FontResourcePayload] = Field(
        default_factory=list, alias="fontResources"
    )


class NativeTextFontValidationPlan(BaseModel):
    """A non-persistent check of the exact native-text export insertion path."""

    page_index: int = Field(alias="pageIndex", ge=0)
    edit: NativeTextEdit
    font_resources: list[FontResourcePayload] = Field(
        default_factory=list, alias="fontResources"
    )


class SignatureImagePayload(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    mime_type: Literal["image/png", "image/jpeg"] = Field(alias="mimeType")
    data_url: str = Field(alias="dataUrl", min_length=1, max_length=7_100_000)
    width: int = Field(gt=0, le=20_000)
    height: int = Field(gt=0, le=20_000)


class SignatureEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["signature"]
    source_document_id: str | None = Field(
        default=None,
        alias="sourceDocumentId",
    )
    page: int = Field(ge=1)
    rect: PdfEditRect
    image_id: str = Field(alias="imageId", min_length=1, max_length=200)
    order: int = Field(default=0, ge=0)


class ShapeStyle(BaseModel):
    stroke_color: str = Field(alias="strokeColor", pattern=r"^#[0-9A-Fa-f]{6}$")
    stroke_width: float = Field(
        alias="strokeWidth",
        ge=0.5,
        le=50,
        allow_inf_nan=False,
    )
    fill_color: str | None = Field(
        default=None,
        alias="fillColor",
        pattern=r"^#[0-9A-Fa-f]{6}$",
    )
    opacity: float = Field(default=1, ge=0, le=1, allow_inf_nan=False)


class ShapeEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["shape"]
    shape_type: Literal["rectangle", "ellipse", "line"] = Field(alias="shapeType")
    source_document_id: str | None = Field(
        default=None,
        alias="sourceDocumentId",
    )
    page: int = Field(ge=1)
    rect: PdfEditRect
    style: ShapeStyle
    order: int = Field(default=0, ge=0)


class FreehandPoint(BaseModel):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


class FreehandStyle(BaseModel):
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    stroke_width: float = Field(alias="strokeWidth", ge=0.5, le=50)
    opacity: float = Field(default=1, ge=0, le=1, allow_inf_nan=False)


class FreehandEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["freehand"]
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    page: int = Field(ge=1)
    rect: PdfEditRect
    points: list[FreehandPoint] = Field(min_length=2, max_length=10_000)
    style: FreehandStyle
    order: int = Field(default=0, ge=0)


class TextMarkupEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["text_markup"]
    kind: Literal["highlight", "underline", "strikeout"]
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    page: int = Field(ge=1)
    rect: PdfEditRect
    rects: list[PdfEditRect] = Field(min_length=1, max_length=500)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    order: int = Field(default=0, ge=0)


class PdfCommentEdit(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: Literal["comment"]
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    page: int = Field(ge=1)
    rect: PdfEditRect
    comment_type: Literal["text"] = Field(default="text", alias="commentType")
    content: str = Field(min_length=1, max_length=10_000)
    author: str | None = Field(default=None, max_length=200)
    created_at: str | None = Field(default=None, alias="createdAt")
    modified_at: str | None = Field(default=None, alias="modifiedAt")
    source: Literal["local"] = "local"
    order: int = Field(default=0, ge=0)


class PdfAnnotationResponse(BaseModel):
    id: str
    page_index: int = Field(alias="pageIndex")
    type: str
    rect: PdfEditRect
    content: str = ""
    author: str | None = None
    created_at: str | None = Field(default=None, alias="createdAt")
    modified_at: str | None = Field(default=None, alias="modifiedAt")


class PdfFormFieldResponse(BaseModel):
    id: str
    page_index: int = Field(alias="pageIndex")
    name: str
    field_type: Literal["text", "checkbox", "radio", "combo", "list", "unsupported"] = Field(alias="fieldType")
    value: str | list[str] = ""
    rect: PdfEditRect
    read_only: bool = Field(alias="readOnly")
    required: bool = False
    multiline: bool = False
    editable: bool = False
    options: list[str] = Field(default_factory=list)
    button_value: str | None = Field(default=None, alias="buttonValue")


class PdfFormValue(BaseModel):
    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    page: int = Field(ge=1)
    field_name: str = Field(alias="fieldName", min_length=1, max_length=500)
    value: str | list[str]


class PdfFormLock(BaseModel):
    """A document-scoped request to set the standard AcroForm ReadOnly flag."""

    source_document_id: str | None = Field(default=None, alias="sourceDocumentId")
    locked: bool = True


class OrganizeExportPlan(BaseModel):
    output_name: str | None = Field(default=None, alias="outputName")
    pages: list[OrganizeExportPage]
    edits: list[AddTextEdit] = Field(default_factory=list)
    native_text_edits: list[NativeTextEdit] = Field(
        default_factory=list, alias="nativeTextEdits"
    )
    font_resources: list[FontResourcePayload] = Field(
        default_factory=list, alias="fontResources"
    )
    signatures: list[SignatureEdit] = Field(default_factory=list)
    shapes: list[ShapeEdit] = Field(default_factory=list)
    freehands: list[FreehandEdit] = Field(default_factory=list)
    text_markups: list[TextMarkupEdit] = Field(
        default_factory=list, alias="textMarkups"
    )
    comments: list[PdfCommentEdit] = Field(default_factory=list)
    form_values: list[PdfFormValue] = Field(default_factory=list, alias="formValues")
    form_locks: list[PdfFormLock] = Field(default_factory=list, alias="formLocks")
    signature_images: list[SignatureImagePayload] = Field(
        default_factory=list,
        alias="signatureImages",
    )
    save_to_output_dir: bool = Field(default=False, alias="saveToOutputDir")


class ExportWarning(BaseModel):
    type: Literal["text_overflow"] = "text_overflow"
    edit_id: str = Field(alias="editId")
    page: int = Field(ge=1)
    rendering: Literal["expanded", "partial"]


PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = PROJECT_ROOT / "data" / "output"
BUNDLED_FONT_DIR = PROJECT_ROOT / "apps" / "web" / "public" / "fonts"
FORBIDDEN_OUTPUT_NAME_CHARACTERS = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
WINDOWS_RESERVED_OUTPUT_NAME = re.compile(
    r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$",
    re.IGNORECASE,
)
logger = logging.getLogger(__name__)

app = FastAPI(title="PDF Engine MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
    ],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
    expose_headers=[
        "Content-Disposition",
        "X-Pdf-Output-Status",
        "X-Pdf-Output-Warning",
        "X-Pdf-Export-Warnings",
        "X-Conversion-Format",
        "X-Conversion-Duration-Ms",
        "X-Conversion-Input-Bytes",
        "X-Conversion-Output-Bytes",
        "X-Conversion-Ocr-Used",
        "X-Conversion-Pages",
        "X-Conversion-Warnings",
        "X-Conversion-Text-Layer",
        "X-Conversion-Docx-Mode",
        "X-Conversion-Stage",
    ],
)
app.include_router(ocr_router)
app.include_router(conversion_router)


@app.exception_handler(OcrError)
async def handle_ocr_error(_: Request, error: OcrError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"code": error.code, "message": error.message},
    )


@app.exception_handler(ConversionError)
async def handle_conversion_error(
    request: Request,
    error: ConversionError,
) -> JSONResponse:
    logger.warning(
        "Conversion failure path=%s stage=%s code=%s status=%s diagnostic=%s",
        request.url.path,
        error.stage or "unknown",
        error.code,
        error.status_code,
        error.diagnostic or "none",
    )
    content = {"code": error.code, "message": error.message}
    if error.stage is not None:
        content["stage"] = error.stage
    return JSONResponse(
        status_code=error.status_code,
        content=content,
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


def parse_organize_plan(serialized_plan: str) -> OrganizeExportPlan:
    try:
        return OrganizeExportPlan.model_validate_json(serialized_plan)
    except ValidationError as error:
        raise HTTPException(
            status_code=422,
            detail="Le plan d'organisation est invalide.",
        ) from error


def build_output_name(upload_name: str | None, requested_name: str | None) -> str:
    if requested_name is not None:
        if "/" in requested_name or "\\" in requested_name:
            raise HTTPException(
                status_code=422, detail="Le nom de sortie est invalide."
            )
        requested_stem = re.sub(r"(?:\.pdf)+$", "", requested_name, flags=re.IGNORECASE)
        stem = FORBIDDEN_OUTPUT_NAME_CHARACTERS.sub("-", requested_stem)
    else:
        stem = FORBIDDEN_OUTPUT_NAME_CHARACTERS.sub(
            "-", Path(upload_name or "document").stem
        )

    stem = stem.strip().rstrip(". ")
    if not stem:
        raise HTTPException(status_code=422, detail="Le nom de sortie est invalide.")
    if WINDOWS_RESERVED_OUTPUT_NAME.fullmatch(stem):
        stem = f"_{stem}"

    suffix = "" if requested_name is not None else "-modifie"
    return f"{stem}{suffix}.pdf"


def build_content_disposition(output_name: str) -> str:
    encoded_name = quote(output_name, safe="")
    if encoded_name == output_name:
        return f'attachment; filename="{output_name}"'

    ascii_name = (
        re.sub(r"[^A-Za-z0-9._ ()-]", "-", output_name).strip(". ") or "document.pdf"
    )
    return f'attachment; filename="{ascii_name}"; ' f"filename*=UTF-8''{encoded_name}"


def parse_document_ids(serialized_ids: str | None, file_count: int) -> list[str]:
    if serialized_ids is None:
        if file_count == 1:
            return ["active-document"]

        raise HTTPException(
            status_code=422,
            detail="Les identifiants des documents source sont requis.",
        )

    try:
        document_ids = json.loads(serialized_ids)
    except json.JSONDecodeError as error:
        raise HTTPException(
            status_code=422, detail="Les identifiants des documents sont invalides."
        ) from error

    if (
        not isinstance(document_ids, list)
        or len(document_ids) != file_count
        or not all(
            isinstance(document_id, str) and document_id for document_id in document_ids
        )
        or len(set(document_ids)) != len(document_ids)
    ):
        raise HTTPException(
            status_code=422, detail="Les identifiants des documents sont invalides."
        )

    return document_ids


def read_source_pdf(source: bytes) -> PdfReader:
    try:
        reader = PdfReader(io.BytesIO(source), strict=True)
    except (PdfReadError, ValueError) as error:
        raise HTTPException(
            status_code=400, detail="Un fichier fourni n'est pas un PDF valide."
        ) from error

    if reader.is_encrypted:
        raise HTTPException(
            status_code=400, detail="Les PDF protégés ne sont pas pris en charge."
        )

    return reader


FONT_NAMES: dict[tuple[str, bool], str] = {
    ("Helvetica", False): "helv",
    ("Helvetica", True): "hebo",
    ("Times", False): "tiro",
    ("Times", True): "tibo",
    ("Courier", False): "cour",
    ("Courier", True): "cobo",
}

FONT_STYLE_NAMES: dict[tuple[str, bool, str], str] = {
    ("Helvetica", False, "normal"): "helv",
    ("Helvetica", True, "normal"): "hebo",
    ("Helvetica", False, "italic"): "heit",
    ("Helvetica", True, "italic"): "hebi",
    ("Times", False, "normal"): "tiro",
    ("Times", True, "normal"): "tibo",
    ("Times", False, "italic"): "tiit",
    ("Times", True, "italic"): "tibi",
    ("Courier", False, "normal"): "cour",
    ("Courier", True, "normal"): "cobo",
    ("Courier", False, "italic"): "coit",
    ("Courier", True, "italic"): "cobi",
}

BUNDLED_FONT_FILES = {
    f"bundled:{slug}:400:normal": file_name
    for slug, file_name in (
        ("inter", "Inter-Regular.ttf"),
        ("roboto", "Roboto-Regular.ttf"),
        ("open-sans", "OpenSans-Regular.ttf"),
        ("lato", "Lato-Regular.ttf"),
        ("source-sans-3", "SourceSans3-Regular.otf"),
        ("noto-sans", "NotoSans-Regular.ttf"),
        ("montserrat", "Montserrat-Regular.ttf"),
        ("poppins", "Poppins-Regular.ttf"),
        ("ibm-plex-sans", "IBMPlexSans-Regular.ttf"),
        ("ubuntu", "Ubuntu-Regular.ttf"),
        ("noto-serif", "NotoSerif-Regular.ttf"),
        ("liberation-serif", "LiberationSerif-Regular.ttf"),
        ("dejavu-serif", "DejaVuSerif.ttf"),
        ("merriweather", "Merriweather-Regular.ttf"),
        ("playfair-display", "PlayfairDisplay-Regular.ttf"),
        ("ibm-plex-serif", "IBMPlexSerif-Regular.ttf"),
        ("liberation-mono", "LiberationMono-Regular.ttf"),
        ("dejavu-sans-mono", "DejaVuSansMono.ttf"),
        ("fira-mono", "FiraMono-Regular.ttf"),
        ("ibm-plex-mono", "IBMPlexMono-Regular.ttf"),
    )
}


def _resolve_source_document_id(
    source_document_id: str | None,
    readers: dict[str, PdfReader],
) -> str:
    if source_document_id is None and len(readers) == 1:
        return next(iter(readers))

    if source_document_id not in readers:
        raise HTTPException(
            status_code=422,
            detail=f"Le document source {source_document_id!r} est introuvable.",
        )
    return source_document_id


def _parse_hex_color(value: str) -> tuple[float, float, float]:
    return tuple(int(value[index : index + 2], 16) / 255 for index in (1, 3, 5))


def _rgb_hex(value: int) -> str:
    return f"#{value & 0xFFFFFF:06x}"


def _clean_font_name(value: str) -> str:
    return re.sub(r"^[A-Z]{6}\+", "", value)


def _font_lookup_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _clean_font_name(value).lower())


def _native_text_rotation(direction: tuple[float, float] | list[float]) -> int | None:
    angle = round(math.degrees(math.atan2(-direction[1], direction[0]))) % 360
    nearest = min(
        (0, 90, 180, 270),
        key=lambda candidate: abs(((angle - candidate + 180) % 360) - 180),
    )
    return nearest if abs(((angle - nearest + 180) % 360) - 180) <= 1 else None


def _native_text_fingerprint(
    page_index: int,
    block_index: int,
    line_index: int,
    span_index: int,
    text: str,
    bbox: fitz.Rect,
    font_name: str,
    font_size: float,
    rotation: int | None,
) -> str:
    payload = "|".join(
        [
            str(page_index),
            str(block_index),
            str(line_index),
            str(span_index),
            " ".join(text.split()),
            *(f"{value:.3f}" for value in (bbox.x0, bbox.y0, bbox.x1, bbox.y1)),
            font_name,
            f"{font_size:.3f}",
            str(rotation),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _page_font_resources(page: fitz.Page) -> dict[str, tuple[int, str, str]]:
    resources: dict[str, tuple[int, str, str]] = {}
    for font in page.get_fonts(full=True):
        xref, extension, _font_type, base_name, resource_name = font[:5]
        resources[_font_lookup_key(str(base_name))] = (
            int(xref),
            str(resource_name),
            str(extension),
        )
    return resources


def _iter_native_text_spans(page: fitz.Page, page_index: int):
    inverse = ~page.transformation_matrix
    resources = _page_font_resources(page)
    blocks = page.get_text("dict", flags=fitz.TEXTFLAGS_DICT)["blocks"]
    for block_index, block in enumerate(blocks):
        for line_index, line in enumerate(block.get("lines", [])):
            direction = line.get("dir", (1.0, 0.0))
            rotation = _native_text_rotation(direction)
            for span_index, span in enumerate(line.get("spans", [])):
                text = str(span.get("text", ""))
                if not text.strip():
                    continue
                page_bbox = fitz.Rect(span["bbox"])
                source_bbox = page_bbox * inverse
                source_origin = fitz.Point(span["origin"]) * inverse
                font_name = _clean_font_name(str(span.get("font") or ""))
                resource = resources.get(_font_lookup_key(font_name))
                char_flags = int(span.get("char_flags", 0))
                invisible = int(span.get("alpha", 255)) == 0 or not (
                    char_flags & (2**3 | 2**4)
                )
                writing_mode = int(line.get("wmode", 0))
                limitation = None
                limitation_message = None
                if invisible:
                    limitation = "invisible_text"
                    limitation_message = "Couche de texte invisible (OCR) : les pixels du scan ne seraient pas modifiés."
                elif writing_mode != 0:
                    limitation = "unsupported_writing_mode"
                    limitation_message = "Cette écriture verticale n'est pas encore exportable fidèlement."
                elif rotation is None:
                    limitation = "complex_transform"
                    limitation_message = "La transformation de ce texte est trop complexe pour une édition sûre."
                fingerprint = _native_text_fingerprint(
                    page_index,
                    block_index,
                    line_index,
                    span_index,
                    text,
                    page_bbox,
                    font_name,
                    float(span["size"]),
                    rotation,
                )
                yield {
                    "page": page_index + 1,
                    "rect": {
                        "x0": source_bbox.x0,
                        "y0": source_bbox.y0,
                        "x1": source_bbox.x1,
                        "y1": source_bbox.y1,
                    },
                    "sourceId": f"p{page_index}-b{block_index}-l{line_index}-s{span_index}",
                    "sourceText": text,
                    "sourceBBox": {
                        "x0": source_bbox.x0,
                        "y0": source_bbox.y0,
                        "x1": source_bbox.x1,
                        "y1": source_bbox.y1,
                    },
                    "sourceOrigin": {"x": source_origin.x, "y": source_origin.y},
                    "sourceFontName": font_name or None,
                    "sourceFontResourceId": str(resource[0])
                    if resource and resource[0] > 0 and resource[2] != "n/a"
                    else None,
                    "sourceFontSize": float(span["size"]),
                    "sourceColor": _rgb_hex(int(span.get("color", 0))),
                    "sourceRotation": rotation or 0,
                    "sourceFingerprint": fingerprint,
                    "editable": limitation is None,
                    "limitation": limitation,
                    "limitationMessage": limitation_message,
                    "fontWeight": 700
                    if int(span.get("flags", 0)) & fitz.TEXT_FONT_BOLD
                    else 400,
                    "fontStyle": "italic"
                    if int(span.get("flags", 0)) & fitz.TEXT_FONT_ITALIC
                    else "normal",
                }


@app.post("/pdf/native-text")
async def extract_native_text(
    file: Annotated[UploadFile, File(description="PDF source")],
    page_index: Annotated[int, Form(alias="pageIndex", ge=0)],
) -> dict[str, list[dict[str, object]]]:
    source = await file.read()
    if not source:
        raise HTTPException(status_code=400, detail="Le fichier PDF est vide.")
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            if document.needs_pass:
                raise HTTPException(
                    status_code=400,
                    detail="Les PDF protégés ne sont pas pris en charge.",
                )
            if page_index >= document.page_count:
                raise HTTPException(
                    status_code=422, detail="La page demandée est invalide."
                )
            return {
                "spans": list(_iter_native_text_spans(document[page_index], page_index))
            }
    except HTTPException:
        raise
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="Le texte natif du PDF est illisible."
        ) from error


MAX_SIGNATURE_IMAGE_BYTES = 5 * 1024 * 1024
TEXTBOX_LINE_HEIGHT = 1.2
TEXTBOX_HEIGHT_MARGIN = 0.5


def _decode_signature_image(image: SignatureImagePayload) -> bytes:
    expected_prefix = f"data:{image.mime_type};base64,"
    if not image.data_url.startswith(expected_prefix):
        raise HTTPException(
            status_code=422,
            detail=f"Les données de l'image de signature {image.id!r} sont invalides.",
        )

    try:
        decoded = base64.b64decode(
            image.data_url[len(expected_prefix) :],
            validate=True,
        )
    except (binascii.Error, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail=f"Les données de l'image de signature {image.id!r} sont invalides.",
        ) from error

    if not decoded or len(decoded) > MAX_SIGNATURE_IMAGE_BYTES:
        raise HTTPException(
            status_code=422,
            detail=f"L'image de signature {image.id!r} dépasse la taille autorisée.",
        )
    is_valid_png = image.mime_type == "image/png" and decoded.startswith(
        b"\x89PNG\r\n\x1a\n"
    )
    is_valid_jpeg = (
        image.mime_type == "image/jpeg"
        and decoded.startswith(b"\xff\xd8")
        and decoded.endswith(b"\xff\xd9")
    )
    if not is_valid_png and not is_valid_jpeg:
        raise HTTPException(
            status_code=422,
            detail=f"Le format de l'image de signature {image.id!r} est invalide.",
        )
    return decoded


def _decode_font_resources(resources: list[FontResourcePayload]) -> dict[str, bytes]:
    decoded: dict[str, bytes] = {}
    for resource in resources:
        if resource.id in decoded:
            raise HTTPException(
                status_code=422, detail=f"La police {resource.id!r} est dupliquée."
            )
        match = re.fullmatch(
            r"data:[a-z0-9.+-]+/[a-z0-9.+-]+;base64,(.+)",
            resource.data_url,
            re.DOTALL | re.IGNORECASE,
        )
        if not match:
            raise HTTPException(
                status_code=422,
                detail=f"Le format de la police {resource.id!r} est invalide.",
            )
        try:
            binary = base64.b64decode(match.group(1), validate=True)
        except (binascii.Error, ValueError) as error:
            raise HTTPException(
                status_code=422, detail=f"La police {resource.id!r} est illisible."
            ) from error
        signature = binary[:4]
        valid = (
            signature == b"OTTO"
            if resource.format == "otf"
            else signature in {b"\x00\x01\x00\x00", b"true", b"typ1"}
        )
        if (
            not valid
            or len(binary) > 20 * 1024 * 1024
            or hashlib.sha256(binary).hexdigest() != resource.sha256
        ):
            raise HTTPException(
                status_code=422,
                detail=f"L'intégrité de la police {resource.id!r} est invalide.",
            )
        if resource.id != f"custom:{resource.sha256}":
            raise HTTPException(
                status_code=422,
                detail=f"L'identifiant de la police {resource.id!r} est invalide.",
            )
        try:
            fitz.Font(fontbuffer=binary)
        except (RuntimeError, ValueError) as error:
            raise HTTPException(
                status_code=422,
                detail=f"La police {resource.id!r} n'est pas exploitable.",
            ) from error
        decoded[resource.id] = binary
    return decoded


def _ensure_font_has_glyphs(font: fitz.Font, text: str, font_ref: str) -> None:
    missing = sorted(
        {
            character
            for character in text
            if not character.isspace() and not font.has_glyph(ord(character))
        }
    )
    if missing:
        preview = "".join(missing[:8])
        raise HTTPException(
            status_code=422,
            detail=f"La police {font_ref!r} ne contient pas les glyphes nécessaires ({preview}). Choisissez un fallback explicite.",
        )


def _resolve_insert_font(
    page: fitz.Page,
    style: AddTextStyle,
    text: str,
    font_resources: dict[str, bytes],
    native_source: NativeTextSource | None = None,
) -> str:
    font_ref = style.font_ref
    if not font_ref:
        font_ref = {
            "Helvetica": "pdf-standard:helvetica:400:normal",
            "Times": "pdf-standard:times:400:normal",
            "Courier": "pdf-standard:courier:400:normal",
        }.get(style.font_family)
    if font_ref and font_ref.startswith("pdf-standard:"):
        family = {"helvetica": "Helvetica", "times": "Times", "courier": "Courier"}.get(
            font_ref.split(":")[1], style.font_family
        )
        fontname = FONT_STYLE_NAMES.get((family, style.bold, style.font_style))
        if not fontname:
            raise HTTPException(
                status_code=422,
                detail=f"La variante de police {font_ref!r} n'est pas disponible.",
            )
        _ensure_font_has_glyphs(fitz.Font(fontname=fontname), text, font_ref)
        return fontname
    if font_ref in BUNDLED_FONT_FILES:
        path = BUNDLED_FONT_DIR / BUNDLED_FONT_FILES[font_ref]
        if not path.is_file():
            raise HTTPException(
                status_code=422,
                detail=f"La police intégrée {font_ref!r} est absente de l'installation.",
            )
        font = fitz.Font(fontfile=str(path))
        _ensure_font_has_glyphs(font, text, font_ref)
        alias = f"BF{hashlib.sha256(font_ref.encode()).hexdigest()[:10]}"
        page.insert_font(fontname=alias, fontfile=str(path))
        return alias
    if font_ref and font_ref.startswith("custom:"):
        binary = font_resources.get(font_ref)
        if binary is None:
            raise HTTPException(
                status_code=422,
                detail=f"La police personnalisée {font_ref!r} n'a pas été jointe à l'export.",
            )
        _ensure_font_has_glyphs(fitz.Font(fontbuffer=binary), text, font_ref)
        alias = f"CF{font_ref.removeprefix('custom:')[:10]}"
        page.insert_font(fontname=alias, fontbuffer=binary)
        return alias
    if font_ref and font_ref.startswith("document:") and native_source:
        try:
            xref = int(native_source.source_font_resource_id or "0")
        except ValueError:
            xref = 0
        extracted = page.parent.extract_font(xref, named=True) if xref > 0 else None
        binary = extracted.get("content") if isinstance(extracted, dict) else None
        if not binary:
            raise HTTPException(
                status_code=422,
                detail="La police source du document ne peut pas être réutilisée. Choisissez une police intégrée.",
            )
        _ensure_font_has_glyphs(fitz.Font(fontbuffer=binary), text, font_ref)
        alias = f"DF{xref}"
        page.insert_font(fontname=alias, fontbuffer=binary)
        return alias
    raise HTTPException(
        status_code=422,
        detail=f"La police {font_ref or style.font_family!r} n'est pas exportable.",
    )


def _textbox_shape(
    page: fitz.Page,
    rect: fitz.Rect,
    edit: AddTextEdit,
    text: str,
    fontname: str,
) -> tuple[fitz.Shape, float]:
    shape = page.new_shape()
    spare_height = shape.insert_textbox(
        rect,
        text,
        fontname=fontname,
        fontsize=edit.style.font_size,
        color=_parse_hex_color(edit.style.color),
        lineheight=TEXTBOX_LINE_HEIGHT,
    )
    return shape, spare_height


def _expand_text_rect_vertically(
    requested_rect: fitz.Rect,
    page_rect: fitz.Rect,
    required_height: float,
) -> fitz.Rect:
    """Keep x/width fixed, grow downward, then use space above if needed."""
    target_height = min(
        max(requested_rect.height, required_height),
        page_rect.height,
    )
    expanded_y0 = max(page_rect.y0, min(requested_rect.y0, page_rect.y1))
    expanded_y1 = min(page_rect.y1, expanded_y0 + target_height)
    missing_height = target_height - (expanded_y1 - expanded_y0)
    if missing_height > 0:
        expanded_y0 = max(page_rect.y0, expanded_y0 - missing_height)
    return fitz.Rect(
        requested_rect.x0,
        expanded_y0,
        requested_rect.x1,
        expanded_y1,
    )


def _largest_fitting_text_prefix(
    page: fitz.Page,
    rect: fitz.Rect,
    edit: AddTextEdit,
    fontname: str,
) -> str:
    """Return the longest prefix PyMuPDF can place without shrinking the font."""
    low = 0
    high = len(edit.text)
    while low < high:
        candidate_length = (low + high + 1) // 2
        _shape, spare_height = _textbox_shape(
            page,
            rect,
            edit,
            edit.text[:candidate_length],
            fontname,
        )
        if spare_height >= 0:
            low = candidate_length
        else:
            high = candidate_length - 1
    return edit.text[:low]


def _insert_text_best_effort(
    page: fitz.Page,
    requested_rect: fitz.Rect,
    edit: AddTextEdit,
    fontname: str,
) -> Literal["exact", "expanded", "partial"]:
    requested_shape, spare_height = _textbox_shape(
        page,
        requested_rect,
        edit,
        edit.text,
        fontname,
    )
    if spare_height >= 0:
        requested_shape.commit(overlay=True)
        return "exact"

    required_height = requested_rect.height - spare_height + TEXTBOX_HEIGHT_MARGIN
    expanded_rect = _expand_text_rect_vertically(
        requested_rect,
        page.rect,
        required_height,
    )
    expanded_shape, expanded_spare_height = _textbox_shape(
        page,
        expanded_rect,
        edit,
        edit.text,
        fontname,
    )
    if expanded_spare_height >= 0:
        expanded_shape.commit(overlay=True)
        return "expanded"

    available_page_rect = fitz.Rect(
        requested_rect.x0,
        page.rect.y0,
        requested_rect.x1,
        page.rect.y1,
    )
    if expanded_rect != available_page_rect:
        page_shape, page_spare_height = _textbox_shape(
            page,
            available_page_rect,
            edit,
            edit.text,
            fontname,
        )
        if page_spare_height >= 0:
            page_shape.commit(overlay=True)
            return "expanded"

    fitting_text = _largest_fitting_text_prefix(
        page, available_page_rect, edit, fontname
    )
    if fitting_text:
        partial_shape, partial_spare_height = _textbox_shape(
            page,
            available_page_rect,
            edit,
            fitting_text,
            fontname,
        )
        if partial_spare_height >= 0:
            partial_shape.commit(overlay=True)
    return "partial"


def apply_visual_edits(
    source: bytes,
    text_edits_by_output_page: dict[int, list[AddTextEdit]],
    signature_edits_by_output_page: dict[int, list[SignatureEdit]],
    signature_images: dict[str, bytes],
    export_warnings: list[ExportWarning] | None = None,
    shape_edits_by_output_page: dict[int, list[ShapeEdit]] | None = None,
    freehand_edits_by_output_page: dict[int, list[FreehandEdit]] | None = None,
    text_markup_edits_by_output_page: dict[int, list[TextMarkupEdit]] | None = None,
    comment_edits_by_output_page: dict[int, list[PdfCommentEdit]] | None = None,
    native_text_edits_by_output_page: dict[int, list[NativeTextEdit]] | None = None,
    font_resources: dict[str, bytes] | None = None,
) -> bytes:
    shape_edits_by_output_page = shape_edits_by_output_page or {}
    freehand_edits_by_output_page = freehand_edits_by_output_page or {}
    text_markup_edits_by_output_page = text_markup_edits_by_output_page or {}
    comment_edits_by_output_page = comment_edits_by_output_page or {}
    native_text_edits_by_output_page = native_text_edits_by_output_page or {}
    font_resources = font_resources or {}
    if (
        not text_edits_by_output_page
        and not signature_edits_by_output_page
        and not shape_edits_by_output_page
        and not freehand_edits_by_output_page
        and not text_markup_edits_by_output_page
        and not comment_edits_by_output_page
        and not native_text_edits_by_output_page
    ):
        return source

    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            output_page_indexes = (
                set(text_edits_by_output_page)
                | set(signature_edits_by_output_page)
                | set(shape_edits_by_output_page)
                | set(freehand_edits_by_output_page)
                | set(text_markup_edits_by_output_page)
                | set(comment_edits_by_output_page)
                | set(native_text_edits_by_output_page)
            )
            for output_page_index in sorted(output_page_indexes):
                page = document[output_page_index]
                native_targets: list[tuple[NativeTextEdit, dict[str, object]]] = []
                for native_edit in native_text_edits_by_output_page.get(
                    output_page_index, []
                ):
                    if not native_edit.source.editable:
                        raise HTTPException(
                            status_code=422,
                            detail=f"Le texte natif {native_edit.id!r} est marqué comme non éditable.",
                        )
                    candidates = [
                        candidate
                        for candidate in _iter_native_text_spans(
                            page, native_edit.page - 1
                        )
                        if candidate["sourceFingerprint"]
                        == native_edit.source.source_fingerprint
                    ]
                    if (
                        len(candidates) != 1
                        or candidates[0]["sourceText"] != native_edit.source.source_text
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=f"La cible du texte natif {native_edit.id!r} est absente, ambiguë ou a changé.",
                        )
                    candidate = candidates[0]
                    candidate_bbox = candidate["sourceBBox"]
                    assert isinstance(candidate_bbox, dict)
                    supplied = native_edit.source.source_bbox
                    if (
                        max(
                            abs(float(candidate_bbox[key]) - getattr(supplied, key))
                            for key in ("x0", "y0", "x1", "y1")
                        )
                        > 1.0
                    ):
                        raise HTTPException(
                            status_code=409,
                            detail=f"La géométrie du texte natif {native_edit.id!r} a changé.",
                        )
                    target_rect = (
                        fitz.Rect(
                            float(candidate_bbox["x0"]),
                            float(candidate_bbox["y0"]),
                            float(candidate_bbox["x1"]),
                            float(candidate_bbox["y1"]),
                        )
                        * page.transformation_matrix
                    )
                    page.add_redact_annot(target_rect, fill=False, cross_out=False)
                    native_targets.append((native_edit, candidate))
                if native_targets:
                    page.apply_redactions(
                        images=fitz.PDF_REDACT_IMAGE_NONE,
                        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
                        text=fitz.PDF_REDACT_TEXT_REMOVE,
                    )
                    for native_edit, candidate in native_targets:
                        if not native_edit.text:
                            continue
                        runtime_source = native_edit.source.model_copy(
                            update={
                                "source_font_resource_id": candidate.get(
                                    "sourceFontResourceId"
                                )
                            }
                        )
                        fontname = _resolve_insert_font(
                            page,
                            native_edit.style,
                            native_edit.text,
                            font_resources,
                            runtime_source,
                        )
                        candidate_origin = candidate["sourceOrigin"]
                        assert isinstance(candidate_origin, dict)
                        origin = (
                            fitz.Point(
                                float(candidate_origin["x"]),
                                float(candidate_origin["y"]),
                            )
                            * page.transformation_matrix
                        )
                        page.insert_text(
                            origin,
                            native_edit.text,
                            fontname=fontname,
                            fontsize=native_edit.style.font_size,
                            color=_parse_hex_color(native_edit.style.color),
                            rotate=native_edit.source.source_rotation,
                            overlay=True,
                        )
                visual_edits: list[
                    AddTextEdit | SignatureEdit | ShapeEdit | FreehandEdit
                ] = [
                    *text_edits_by_output_page.get(output_page_index, []),
                    *signature_edits_by_output_page.get(output_page_index, []),
                    *shape_edits_by_output_page.get(output_page_index, []),
                    *freehand_edits_by_output_page.get(output_page_index, []),
                ]
                for edit in sorted(visual_edits, key=lambda item: item.order):
                    pdf_rect = fitz.Rect(
                        edit.rect.x0,
                        edit.rect.y0,
                        edit.rect.x1,
                        edit.rect.y1,
                    )
                    page_rect = pdf_rect * page.transformation_matrix
                    if isinstance(edit, AddTextEdit):
                        if not edit.text:
                            continue
                        fontname = _resolve_insert_font(
                            page, edit.style, edit.text, font_resources
                        )
                        rendering = _insert_text_best_effort(
                            page, page_rect, edit, fontname
                        )
                        if rendering != "exact":
                            warning = ExportWarning(
                                editId=edit.id,
                                page=output_page_index + 1,
                                rendering=rendering,
                            )
                            if export_warnings is not None:
                                export_warnings.append(warning)
                            logger.warning(
                                "Text overflow: edit_id=%s page=%s rendering=%s",
                                edit.id,
                                output_page_index + 1,
                                rendering,
                            )
                    elif isinstance(edit, SignatureEdit):
                        page.insert_image(
                            page_rect,
                            stream=signature_images[edit.image_id],
                            keep_proportion=True,
                            overlay=True,
                        )
                    elif isinstance(edit, ShapeEdit):
                        stroke = _parse_hex_color(edit.style.stroke_color)
                        fill = (
                            None
                            if edit.shape_type == "line"
                            or edit.style.fill_color is None
                            else _parse_hex_color(edit.style.fill_color)
                        )
                        if edit.shape_type == "rectangle":
                            page.draw_rect(
                                page_rect,
                                color=stroke,
                                fill=fill,
                                width=edit.style.stroke_width,
                                stroke_opacity=edit.style.opacity,
                                fill_opacity=edit.style.opacity,
                                overlay=True,
                            )
                        elif edit.shape_type == "ellipse":
                            page.draw_oval(
                                page_rect,
                                color=stroke,
                                fill=fill,
                                width=edit.style.stroke_width,
                                stroke_opacity=edit.style.opacity,
                                fill_opacity=edit.style.opacity,
                                overlay=True,
                            )
                        else:
                            page.draw_line(
                                page_rect.tl,
                                page_rect.br,
                                color=stroke,
                                width=edit.style.stroke_width,
                                stroke_opacity=edit.style.opacity,
                                overlay=True,
                            )
                    else:
                        points = [
                            fitz.Point(point.x, point.y) * page.transformation_matrix
                            for point in edit.points
                        ]
                        page.draw_polyline(
                            points,
                            color=_parse_hex_color(edit.style.color),
                            width=edit.style.stroke_width,
                            stroke_opacity=edit.style.opacity,
                            overlay=True,
                        )
                for markup in sorted(
                    text_markup_edits_by_output_page.get(output_page_index, []),
                    key=lambda item: item.order,
                ):
                    color = _parse_hex_color(markup.color)
                    for rect in markup.rects:
                        page_rect = (
                            fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1)
                            * page.transformation_matrix
                        )
                        if markup.kind == "highlight":
                            annotation = page.add_highlight_annot(page_rect)
                        elif markup.kind == "underline":
                            annotation = page.add_underline_annot(page_rect)
                        else:
                            annotation = page.add_strikeout_annot(page_rect)
                        annotation.set_colors(stroke=color)
                        annotation.update()
                for comment in sorted(
                    comment_edits_by_output_page.get(output_page_index, []),
                    key=lambda item: item.order,
                ):
                    point = (
                        fitz.Point(comment.rect.x0, comment.rect.y0)
                        * page.transformation_matrix
                    )
                    annotation = page.add_text_annot(point, comment.content)
                    annotation.set_info(
                        title=comment.author or "",
                        content=comment.content,
                        creationDate=comment.created_at,
                        modDate=comment.modified_at,
                    )
                    annotation.update()
            return document.tobytes(garbage=4, deflate=True)
    except HTTPException:
        raise
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail="Les modifications visuelles n'ont pas pu être appliquées au PDF.",
        ) from error


@app.post("/pdf/native-text/preview", response_class=Response)
async def preview_native_text(
    file: Annotated[UploadFile, File(description="PDF source")],
    plan: Annotated[str, Form(description="Aperçu de texte natif")],
) -> Response:
    source = await file.read()
    if not source:
        raise HTTPException(status_code=400, detail="Le fichier PDF est vide.")
    try:
        preview = NativeTextPreviewPlan.model_validate_json(plan)
    except ValidationError as error:
        raise HTTPException(
            status_code=422, detail="La demande d'aperçu est invalide."
        ) from error
    if any(edit.page != preview.page_index + 1 for edit in preview.edits):
        raise HTTPException(
            status_code=422,
            detail="Les textes de l'aperçu ne ciblent pas la page demandée.",
        )
    edited = apply_visual_edits(
        source,
        {},
        {},
        {},
        native_text_edits_by_output_page={preview.page_index: preview.edits},
        font_resources=_decode_font_resources(preview.font_resources),
    )
    try:
        with fitz.open(stream=edited, filetype="pdf") as document:
            if preview.page_index >= document.page_count:
                raise HTTPException(
                    status_code=422, detail="La page d'aperçu est invalide."
                )
            page = document[preview.page_index]
            if preview.rotation:
                page.set_rotation((page.rotation + preview.rotation) % 360)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            return Response(content=pixmap.tobytes("png"), media_type="image/png")
    except HTTPException:
        raise
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="L'aperçu du texte natif n'a pas pu être rendu."
        ) from error


@app.post("/pdf/native-text/font-validation")
async def validate_native_text_font(
    file: Annotated[UploadFile, File(description="PDF source")],
    plan: Annotated[str, Form(description="Validation de police de texte natif")],
) -> dict[str, str]:
    """Run the real redaction/reinsertion path in memory, without saving a PDF."""
    source = await file.read()
    if not source:
        raise HTTPException(status_code=400, detail="Le fichier PDF est vide.")
    try:
        validation = NativeTextFontValidationPlan.model_validate_json(plan)
    except ValidationError as error:
        raise HTTPException(
            status_code=422, detail="La demande de validation de police est invalide."
        ) from error
    _validate_native_text_font_for_export(source, validation)
    return {"status": "ok"}


def _validate_native_text_font_for_export(
    source: bytes, validation: NativeTextFontValidationPlan
) -> None:
    if validation.edit.page != validation.page_index + 1:
        raise HTTPException(
            status_code=422,
            detail="Le texte ne cible pas la page demandée.",
        )
    # apply_visual_edits performs the source fingerprint, glyph and embeddability
    # checks used by export. Its result is deliberately discarded.
    apply_visual_edits(
        source,
        {},
        {},
        {},
        native_text_edits_by_output_page={validation.page_index: [validation.edit]},
        font_resources=_decode_font_resources(validation.font_resources),
    )


def _reader_has_acroform(reader: PdfReader) -> bool:
    return "/AcroForm" in reader.trailer.get("/Root", {})


def _can_preserve_acroform(plan: OrganizeExportPlan, readers: dict[str, PdfReader]) -> bool:
    """pypdf can clone an AcroForm safely only for an unchanged source order."""
    if len(readers) != 1 or not any(_reader_has_acroform(reader) for reader in readers.values()):
        return False
    document_id, reader = next(iter(readers.items()))
    return len(plan.pages) == len(reader.pages) and all(
        page.source_document_id in {None, document_id}
        and page.source_page_index == index
        and page.rotation == 0
        for index, page in enumerate(plan.pages)
    )


def _pdf_object(value: object) -> object:
    """Dereference pypdf objects without retaining them beyond one export."""
    return value.get_object() if hasattr(value, "get_object") else value


def _inherited_widget_value(widget: object, key: str) -> object | None:
    current = _pdf_object(widget)
    while isinstance(current, dict):
        value = current.get(key)
        if value is not None:
            return _pdf_object(value)
        parent = current.get("/Parent")
        if parent is None:
            return None
        current = _pdf_object(parent)
    return None


def _widget_field_owner(widget: object) -> object:
    """Returns the highest named field dictionary for a widget."""
    current = _pdf_object(widget)
    owner = current
    while isinstance(current, dict):
        if current.get("/T") is not None:
            owner = current
        parent = current.get("/Parent")
        if parent is None:
            break
        current = _pdf_object(parent)
    return owner


def _widget_field_name(widget: object) -> str | None:
    name = _inherited_widget_value(widget, "/T")
    return str(name) if name is not None else None


def _widget_on_values(widget: object) -> set[str]:
    appearance = _inherited_widget_value(widget, "/AP")
    if not isinstance(appearance, dict):
        return set()
    normal = _pdf_object(appearance.get("/N"))
    if not isinstance(normal, dict):
        return set()
    return {str(name).removeprefix("/") for name in normal if str(name) != "/Off"}


def _set_pdf_name(target: object, key: str, value: str) -> None:
    if not isinstance(target, dict):
        raise ValueError("Champ AcroForm invalide.")
    target[NameObject(key)] = NameObject(f"/{value.removeprefix('/')}")


def _button_widgets_for_page(page: object, field_name: str) -> list[object]:
    page_object = _pdf_object(page)
    if not isinstance(page_object, dict):
        return []
    annotations = _pdf_object(page_object.get("/Annots"))
    if not isinstance(annotations, list):
        return []
    widgets: list[object] = []
    for annotation_ref in annotations:
        widget = _pdf_object(annotation_ref)
        if not isinstance(widget, dict) or widget.get("/Subtype") != "/Widget":
            continue
        if _widget_field_name(widget) != field_name:
            continue
        if _inherited_widget_value(widget, "/FT") != "/Btn":
            continue
        widgets.append(widget)
    return widgets


def _apply_button_value(page: object, field_name: str, value: str | list[str]) -> bool:
    """Synchronise /V and every widget /AS using the PDF's actual on values.

    ``PdfWriter.update_page_form_field_values`` is sufficient for text fields,
    but does not reliably update button appearance states for all AcroForms.
    Existing /AP dictionaries already contain the visual appearance, so mapping
    the requested export value to those names keeps the document interactive
    without relying on NeedAppearances.
    """
    if isinstance(value, list):
        raise HTTPException(status_code=422, detail=f"La valeur du bouton {field_name!r} est invalide.")
    widgets = _button_widgets_for_page(page, field_name)
    if not widgets:
        return False

    requested = value.removeprefix("/")
    available = {state for widget in widgets for state in _widget_on_values(widget)}
    if requested != "Off" and requested not in available:
        raise HTTPException(
            status_code=422,
            detail=f"La valeur d’export {value!r} du bouton {field_name!r} n’existe pas dans ce PDF.",
        )

    owner = _widget_field_owner(widgets[0])
    _set_pdf_name(owner, "/V", requested)
    for widget in widgets:
        visible_state = requested if requested in _widget_on_values(widget) else "Off"
        _set_pdf_name(widget, "/AS", visible_state)
    return True


def _apply_form_values_to_writer(
    writer: PdfWriter, form_values_by_page: dict[int, dict[str, str | list[str]]]
) -> None:
    for page_index, values in form_values_by_page.items():
        if page_index < 0 or page_index >= len(writer.pages):
            raise HTTPException(status_code=422, detail="La page ciblée par un champ AcroForm est invalide.")
        page = writer.pages[page_index]
        text_and_choice_values: dict[str, str | list[str]] = {}
        for field_name, value in values.items():
            if not _apply_button_value(page, field_name, value):
                text_and_choice_values[field_name] = value
        if not text_and_choice_values:
            continue
        try:
            writer.update_page_form_field_values(
                page, text_and_choice_values, auto_regenerate=True
            )
        except (KeyError, ValueError, TypeError) as error:
            raise HTTPException(status_code=422, detail="Une valeur de formulaire AcroForm est invalide.") from error


def _iter_acroform_field_dictionaries(writer: PdfWriter):
    """Yield AcroForm field dictionaries recursively without touching widgets' values.

    A field tree can have terminal widgets, a parent field with widget children,
    or several intermediate dictionaries. Applying ``/Ff`` to the dictionaries
    which define ``/FT`` preserves existing /V and /AS appearance states.
    """
    root = _pdf_object(writer._root_object)
    if not isinstance(root, dict):
        return
    acroform = _pdf_object(root.get("/AcroForm"))
    if not isinstance(acroform, dict):
        return
    fields = _pdf_object(acroform.get("/Fields"))
    if not isinstance(fields, list):
        return
    pending = list(fields)
    seen: set[int] = set()
    while pending:
        field = _pdf_object(pending.pop())
        if not isinstance(field, dict) or id(field) in seen:
            continue
        seen.add(id(field))
        if field.get("/FT") is not None:
            yield field
        children = _pdf_object(field.get("/Kids"))
        if isinstance(children, list):
            pending.extend(children)


def _apply_acroform_read_only_lock(writer: PdfWriter) -> None:
    """Marks every editable field ReadOnly while keeping the AcroForm interactive.

    This deliberately updates only bit 1 of /Ff. It neither flattens widgets
    nor regenerates appearances, so checkbox/radio /V and /AS stay intact.
    """
    for field in _iter_acroform_field_dictionaries(writer):
        try:
            flags = int(field.get("/Ff", 0))
        except (TypeError, ValueError):
            flags = 0
        field[NameObject("/Ff")] = NumberObject(flags | 1)


def export_organized_pdf(
    sources: dict[str, bytes],
    plan: OrganizeExportPlan,
    export_warnings: list[ExportWarning] | None = None,
) -> bytes:
    if not plan.pages:
        raise HTTPException(
            status_code=422, detail="Le plan d'organisation ne contient aucune page."
        )

    readers = {
        document_id: read_source_pdf(source) for document_id, source in sources.items()
    }

    writer = PdfWriter()
    preserve_acroform = _can_preserve_acroform(plan, readers)
    if preserve_acroform:
        writer.clone_document_from_reader(next(iter(readers.values())))

    form_values_by_source_page: dict[tuple[str, int], dict[str, str | list[str]]] = {}
    for form_value in plan.form_values:
        source_document_id = _resolve_source_document_id(form_value.source_document_id, readers)
        if form_value.page > len(readers[source_document_id].pages):
            raise HTTPException(status_code=422, detail=f"La page {form_value.page} du champ {form_value.field_name!r} est invalide.")
        form_values_by_source_page.setdefault((source_document_id, form_value.page - 1), {})[form_value.field_name] = form_value.value
    if form_values_by_source_page and not preserve_acroform:
        raise HTTPException(
            status_code=422,
            detail="Les champs AcroForm peuvent être sauvegardés tant que les pages du document ne sont pas réorganisées.",
        )

    form_lock_source_ids = {
        _resolve_source_document_id(form_lock.source_document_id, readers)
        for form_lock in plan.form_locks
        if form_lock.locked
    }
    if form_lock_source_ids and not preserve_acroform:
        raise HTTPException(
            status_code=422,
            detail="Le verrouillage AcroForm est disponible tant que les pages du document ne sont pas réorganisées.",
        )

    edits_by_source_page: dict[tuple[str, int], list[AddTextEdit]] = {}
    for edit in plan.edits:
        source_document_id = _resolve_source_document_id(
            edit.source_document_id,
            readers,
        )
        if edit.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La page {edit.page} du bloc de texte {edit.id!r} " "est invalide."
                ),
            )
        edits_by_source_page.setdefault(
            (source_document_id, edit.page - 1),
            [],
        ).append(edit)

    native_text_edits_by_source_page: dict[tuple[str, int], list[NativeTextEdit]] = {}
    for edit in plan.native_text_edits:
        source_document_id = _resolve_source_document_id(
            edit.source_document_id, readers
        )
        if edit.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=f"La page {edit.page} du texte natif {edit.id!r} est invalide.",
            )
        native_text_edits_by_source_page.setdefault(
            (source_document_id, edit.page - 1), []
        ).append(edit)

    font_resources = _decode_font_resources(plan.font_resources)

    signature_images: dict[str, bytes] = {}
    for image in plan.signature_images:
        if image.id in signature_images:
            raise HTTPException(
                status_code=422,
                detail=f"L'identifiant d'image de signature {image.id!r} est dupliqué.",
            )
        signature_images[image.id] = _decode_signature_image(image)

    signatures_by_source_page: dict[tuple[str, int], list[SignatureEdit]] = {}
    for signature in plan.signatures:
        source_document_id = _resolve_source_document_id(
            signature.source_document_id,
            readers,
        )
        if signature.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La page {signature.page} de la signature {signature.id!r} "
                    "est invalide."
                ),
            )
        if signature.image_id not in signature_images:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"L'image {signature.image_id!r} de la signature "
                    f"{signature.id!r} est introuvable."
                ),
            )
        signatures_by_source_page.setdefault(
            (source_document_id, signature.page - 1),
            [],
        ).append(signature)

    shapes_by_source_page: dict[tuple[str, int], list[ShapeEdit]] = {}
    for shape in plan.shapes:
        source_document_id = _resolve_source_document_id(
            shape.source_document_id,
            readers,
        )
        if shape.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=f"La page {shape.page} de la forme {shape.id!r} est invalide.",
            )
        shapes_by_source_page.setdefault(
            (source_document_id, shape.page - 1),
            [],
        ).append(shape)

    freehands_by_source_page: dict[tuple[str, int], list[FreehandEdit]] = {}
    for freehand in plan.freehands:
        source_document_id = _resolve_source_document_id(
            freehand.source_document_id, readers
        )
        if freehand.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=f"La page {freehand.page} du dessin {freehand.id!r} est invalide.",
            )
        freehands_by_source_page.setdefault(
            (source_document_id, freehand.page - 1), []
        ).append(freehand)

    text_markups_by_source_page: dict[tuple[str, int], list[TextMarkupEdit]] = {}
    for markup in plan.text_markups:
        source_document_id = _resolve_source_document_id(
            markup.source_document_id, readers
        )
        if markup.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=f"La page {markup.page} de l'annotation {markup.id!r} est invalide.",
            )
        text_markups_by_source_page.setdefault(
            (source_document_id, markup.page - 1), []
        ).append(markup)

    comments_by_source_page: dict[tuple[str, int], list[PdfCommentEdit]] = {}
    for comment in plan.comments:
        source_document_id = _resolve_source_document_id(
            comment.source_document_id, readers
        )
        if comment.page > len(readers[source_document_id].pages):
            raise HTTPException(
                status_code=422,
                detail=f"La page {comment.page} du commentaire {comment.id!r} est invalide.",
            )
        comments_by_source_page.setdefault(
            (source_document_id, comment.page - 1), []
        ).append(comment)

    edits_by_output_page: dict[int, list[AddTextEdit]] = {}
    signatures_by_output_page: dict[int, list[SignatureEdit]] = {}
    shapes_by_output_page: dict[int, list[ShapeEdit]] = {}
    freehands_by_output_page: dict[int, list[FreehandEdit]] = {}
    text_markups_by_output_page: dict[int, list[TextMarkupEdit]] = {}
    comments_by_output_page: dict[int, list[PdfCommentEdit]] = {}
    native_text_edits_by_output_page: dict[int, list[NativeTextEdit]] = {}
    form_values_by_output_page: dict[int, dict[str, str | list[str]]] = {}

    for output_page_index, page_plan in enumerate(plan.pages):
        source_document_id = _resolve_source_document_id(
            page_plan.source_document_id,
            readers,
        )
        reader = readers[source_document_id]

        if page_plan.source_page_index >= len(reader.pages):
            raise HTTPException(
                status_code=422,
                detail=(
                    f"L'index de page {page_plan.source_page_index} est invalide "
                    f"pour le document {source_document_id!r}."
                ),
            )

        if not preserve_acroform:
            writer.add_page(reader.pages[page_plan.source_page_index])
            if page_plan.rotation:
                writer.pages[-1].rotate(page_plan.rotation)
        page_edits = edits_by_source_page.get(
            (source_document_id, page_plan.source_page_index),
        )
        if page_edits:
            edits_by_output_page[output_page_index] = page_edits
        page_signatures = signatures_by_source_page.get(
            (source_document_id, page_plan.source_page_index),
        )
        if page_signatures:
            signatures_by_output_page[output_page_index] = page_signatures
        page_shapes = shapes_by_source_page.get(
            (source_document_id, page_plan.source_page_index),
        )
        if page_shapes:
            shapes_by_output_page[output_page_index] = page_shapes
        page_freehands = freehands_by_source_page.get(
            (source_document_id, page_plan.source_page_index)
        )
        if page_freehands:
            freehands_by_output_page[output_page_index] = page_freehands
        page_text_markups = text_markups_by_source_page.get(
            (source_document_id, page_plan.source_page_index)
        )
        if page_text_markups:
            text_markups_by_output_page[output_page_index] = page_text_markups
        page_comments = comments_by_source_page.get(
            (source_document_id, page_plan.source_page_index)
        )
        if page_comments:
            comments_by_output_page[output_page_index] = page_comments
        page_native_text_edits = native_text_edits_by_source_page.get(
            (source_document_id, page_plan.source_page_index)
        )
        if page_native_text_edits:
            native_text_edits_by_output_page[output_page_index] = page_native_text_edits
        page_form_values = form_values_by_source_page.get(
            (source_document_id, page_plan.source_page_index)
        )
        if page_form_values:
            form_values_by_output_page[output_page_index] = page_form_values

    if form_values_by_output_page:
        _apply_form_values_to_writer(writer, form_values_by_output_page)
    if form_lock_source_ids:
        _apply_acroform_read_only_lock(writer)
    output = io.BytesIO()
    writer.write(output)
    return apply_visual_edits(
        output.getvalue(),
        edits_by_output_page,
        signatures_by_output_page,
        signature_images,
        export_warnings,
        shape_edits_by_output_page=shapes_by_output_page,
        freehand_edits_by_output_page=freehands_by_output_page,
        text_markup_edits_by_output_page=text_markups_by_output_page,
        comment_edits_by_output_page=comments_by_output_page,
        native_text_edits_by_output_page=native_text_edits_by_output_page,
        font_resources=font_resources,
    )


def get_output_path(output_name: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    candidate = OUTPUT_DIR / output_name
    suffix = 1

    while candidate.exists():
        candidate = OUTPUT_DIR / f"{Path(output_name).stem}-{suffix}.pdf"
        suffix += 1

    return candidate


def _annotation_type_name(annotation: fitz.Annot) -> str:
    name = str(annotation.type[1]).lower().replace(" ", "_")
    return {
        "text": "text",
        "free_text": "free_text",
        "highlight": "highlight",
        "underline": "underline",
        "strike-out": "strikeout",
        "strikeout": "strikeout",
    }.get(name, "other")


def _form_field_type(widget: fitz.Widget) -> Literal["text", "checkbox", "radio", "combo", "list", "unsupported"]:
    return {
        "Text": "text",
        "CheckBox": "checkbox",
        "RadioButton": "radio",
        "ComboBox": "combo",
        "ListBox": "list",
    }.get(widget.field_type_string, "unsupported")


@app.post("/pdf/forms", response_model=dict[str, list[PdfFormFieldResponse]])
async def extract_pdf_form_fields(
    file: Annotated[UploadFile, File(description="PDF source")],
    page_index: Annotated[int, Form(alias="pageIndex", ge=0)],
) -> dict[str, list[PdfFormFieldResponse]]:
    """Extracts widgets for exactly one page; no document-wide widget cache."""
    source = await file.read()
    if not source:
        raise HTTPException(status_code=400, detail="Le fichier PDF est vide.")
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            if page_index >= document.page_count:
                raise HTTPException(status_code=422, detail="La page de formulaire demandée est invalide.")
            page = document[page_index]
            inverse = ~page.transformation_matrix
            fields: list[PdfFormFieldResponse] = []
            for widget in page.widgets() or []:
                flags = widget.field_flags
                button_states = widget.button_states().get("normal", []) if widget.field_type_string in {"CheckBox", "RadioButton"} else []
                button_value = next((state for state in button_states if state != "Off"), None)
                value = widget.field_value or ""
                fields.append(
                    PdfFormFieldResponse(
                        id=f"form-{page_index}-{widget.xref}",
                        pageIndex=page_index,
                        name=widget.field_name or f"widget-{widget.xref}",
                        fieldType=_form_field_type(widget),
                        value=value,
                        rect=PdfEditRect(
                            x0=(widget.rect * inverse).x0,
                            y0=(widget.rect * inverse).y0,
                            x1=(widget.rect * inverse).x1,
                            y1=(widget.rect * inverse).y1,
                        ),
                        readOnly=bool(flags & 1),
                        required=bool(flags & 2),
                        multiline=bool(flags & 4096),
                        editable=bool(flags & 262144),
                        options=list(widget.choice_values or []),
                        buttonValue=button_value,
                    )
                )
            return {"fields": fields}
    except HTTPException:
        raise
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="Les champs AcroForm du PDF sont illisibles.") from error


@app.post("/pdf/annotations", response_model=dict[str, list[PdfAnnotationResponse]])
async def extract_pdf_annotations(
    file: Annotated[UploadFile, File(description="PDF source")],
) -> dict[str, list[PdfAnnotationResponse]]:
    source = await file.read()
    if not source:
        raise HTTPException(status_code=400, detail="Le fichier PDF est vide.")
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            annotations: list[PdfAnnotationResponse] = []
            for page_index, page in enumerate(document):
                annotation = page.first_annot
                inverse = ~page.transformation_matrix
                while annotation:
                    info = annotation.info or {}
                    rect = annotation.rect * inverse
                    annotations.append(
                        PdfAnnotationResponse(
                            id=f"pdf-annot-{page_index}-{annotation.xref}",
                            pageIndex=page_index,
                            type=_annotation_type_name(annotation),
                            rect=PdfEditRect(
                                x0=rect.x0, y0=rect.y0, x1=rect.x1, y1=rect.y1
                            ),
                            content=str(info.get("content") or ""),
                            author=(
                                str(info.get("title")) if info.get("title") else None
                            ),
                            createdAt=(
                                str(info.get("creationDate"))
                                if info.get("creationDate")
                                else None
                            ),
                            modifiedAt=(
                                str(info.get("modDate"))
                                if info.get("modDate")
                                else None
                            ),
                        )
                    )
                    annotation = annotation.next
            return {"annotations": annotations}
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422, detail="Les annotations du PDF sont illisibles."
        ) from error


@app.post("/pdf/export/organize", response_class=Response)
async def export_organize_pdf(
    plan: Annotated[str, Form(description="Plan d'organisation au format JSON")],
    files: Annotated[
        list[UploadFile] | None, File(description="PDF sources à organiser")
    ] = None,
    document_ids: Annotated[str | None, Form(alias="documentIds")] = None,
    file: Annotated[UploadFile | None, File(description="PDF source legacy")] = None,
) -> Response:
    source_files = files or ([] if file is None else [file])
    if not source_files:
        raise HTTPException(
            status_code=422, detail="Au moins un PDF source est requis."
        )

    for source_file in source_files:
        if source_file.content_type not in {None, "application/pdf"} and not (
            source_file.filename or ""
        ).lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400, detail="Les fichiers source doivent être des PDF."
            )

    organize_plan = parse_organize_plan(plan)
    source_document_ids = parse_document_ids(document_ids, len(source_files))
    sources = {
        document_id: await source_file.read()
        for document_id, source_file in zip(
            source_document_ids, source_files, strict=True
        )
    }

    if any(not source for source in sources.values()):
        raise HTTPException(status_code=400, detail="Un fichier PDF source est vide.")

    output_name = build_output_name(source_files[0].filename, organize_plan.output_name)
    export_warnings: list[ExportWarning] = []
    result = export_organized_pdf(sources, organize_plan, export_warnings)

    output_headers: dict[str, str] = {}
    if export_warnings:
        output_headers["X-Pdf-Export-Warnings"] = json.dumps(
            [warning.model_dump(by_alias=True) for warning in export_warnings],
            ensure_ascii=True,
            separators=(",", ":"),
        )
    if organize_plan.save_to_output_dir:
        try:
            output_path = get_output_path(output_name)
            output_path.write_bytes(result)
            output_name = output_path.name
            output_headers["X-Pdf-Output-Status"] = "saved"
        except OSError as error:
            logger.warning(
                "Impossible d'écrire la copie PDF dans %s: %s", OUTPUT_DIR, error
            )
            output_headers["X-Pdf-Output-Status"] = "warning"
            output_headers["X-Pdf-Output-Warning"] = (
                "La copie dans data/output a échoué ; le PDF est tout de même téléchargé."
            )

    return Response(
        content=result,
        media_type="application/pdf",
        headers={
            "Content-Disposition": build_content_disposition(output_name),
            **output_headers,
        },
    )

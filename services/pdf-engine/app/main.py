from __future__ import annotations

import base64
import binascii
import io
import json
import logging
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


class AddTextStyle(BaseModel):
    font_family: Literal["Helvetica", "Times", "Courier"] = Field(alias="fontFamily")
    font_size: float = Field(alias="fontSize", ge=6, le=144, allow_inf_nan=False)
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    bold: bool = False


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


class OrganizeExportPlan(BaseModel):
    output_name: str | None = Field(default=None, alias="outputName")
    pages: list[OrganizeExportPage]
    edits: list[AddTextEdit] = Field(default_factory=list)
    signatures: list[SignatureEdit] = Field(default_factory=list)
    signature_images: list[SignatureImagePayload] = Field(
        default_factory=list,
        alias="signatureImages",
    )
    save_to_output_dir: bool = Field(default=False, alias="saveToOutputDir")


PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = PROJECT_ROOT / "data" / "output"
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
        requested_stem = re.sub(
            r"(?:\.pdf)+$", "", requested_name, flags=re.IGNORECASE
        )
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
        re.sub(r"[^A-Za-z0-9._ ()-]", "-", output_name).strip(". ")
        or "document.pdf"
    )
    return (
        f'attachment; filename="{ascii_name}"; '
        f"filename*=UTF-8''{encoded_name}"
    )


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
        raise HTTPException(status_code=422, detail="Les identifiants des documents sont invalides.") from error

    if (
        not isinstance(document_ids, list)
        or len(document_ids) != file_count
        or not all(isinstance(document_id, str) and document_id for document_id in document_ids)
        or len(set(document_ids)) != len(document_ids)
    ):
        raise HTTPException(status_code=422, detail="Les identifiants des documents sont invalides.")

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


MAX_SIGNATURE_IMAGE_BYTES = 5 * 1024 * 1024


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


def apply_visual_edits(
    source: bytes,
    text_edits_by_output_page: dict[int, list[AddTextEdit]],
    signature_edits_by_output_page: dict[int, list[SignatureEdit]],
    signature_images: dict[str, bytes],
) -> bytes:
    if not text_edits_by_output_page and not signature_edits_by_output_page:
        return source

    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            output_page_indexes = set(text_edits_by_output_page) | set(
                signature_edits_by_output_page
            )
            for output_page_index in sorted(output_page_indexes):
                page = document[output_page_index]
                visual_edits: list[AddTextEdit | SignatureEdit] = [
                    *text_edits_by_output_page.get(output_page_index, []),
                    *signature_edits_by_output_page.get(output_page_index, []),
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
                        spare_height = page.insert_textbox(
                            page_rect,
                            edit.text,
                            fontname=FONT_NAMES[
                                (edit.style.font_family, edit.style.bold)
                            ],
                            fontsize=edit.style.font_size,
                            color=_parse_hex_color(edit.style.color),
                            lineheight=1.2,
                            overlay=True,
                        )
                        if spare_height < 0:
                            raise HTTPException(
                                status_code=422,
                                detail=(
                                    f"Le bloc de texte {edit.id!r} est trop petit "
                                    "pour contenir son texte."
                                ),
                            )
                    else:
                        page.insert_image(
                            page_rect,
                            stream=signature_images[edit.image_id],
                            keep_proportion=True,
                            overlay=True,
                        )
            return document.tobytes(garbage=4, deflate=True)
    except HTTPException:
        raise
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise HTTPException(
            status_code=422,
            detail="Les modifications visuelles n'ont pas pu être appliquées au PDF.",
        ) from error


def export_organized_pdf(sources: dict[str, bytes], plan: OrganizeExportPlan) -> bytes:
    if not plan.pages:
        raise HTTPException(
            status_code=422, detail="Le plan d'organisation ne contient aucune page."
        )

    readers = {
        document_id: read_source_pdf(source) for document_id, source in sources.items()
    }

    writer = PdfWriter()

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

    edits_by_output_page: dict[int, list[AddTextEdit]] = {}
    signatures_by_output_page: dict[int, list[SignatureEdit]] = {}

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

    output = io.BytesIO()
    writer.write(output)
    return apply_visual_edits(
        output.getvalue(),
        edits_by_output_page,
        signatures_by_output_page,
        signature_images,
    )


def get_output_path(output_name: str) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    candidate = OUTPUT_DIR / output_name
    suffix = 1

    while candidate.exists():
        candidate = OUTPUT_DIR / f"{Path(output_name).stem}-{suffix}.pdf"
        suffix += 1

    return candidate


@app.post("/pdf/export/organize", response_class=Response)
async def export_organize_pdf(
    plan: Annotated[str, Form(description="Plan d'organisation au format JSON")],
    files: Annotated[list[UploadFile] | None, File(description="PDF sources à organiser")] = None,
    document_ids: Annotated[str | None, Form(alias="documentIds")] = None,
    file: Annotated[UploadFile | None, File(description="PDF source legacy")] = None,
) -> Response:
    source_files = files or ([] if file is None else [file])
    if not source_files:
        raise HTTPException(status_code=422, detail="Au moins un PDF source est requis.")

    for source_file in source_files:
        if source_file.content_type not in {None, "application/pdf"} and not (
            source_file.filename or ""
        ).lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Les fichiers source doivent être des PDF.")

    organize_plan = parse_organize_plan(plan)
    source_document_ids = parse_document_ids(document_ids, len(source_files))
    sources = {
        document_id: await source_file.read()
        for document_id, source_file in zip(source_document_ids, source_files, strict=True)
    }

    if any(not source for source in sources.values()):
        raise HTTPException(status_code=400, detail="Un fichier PDF source est vide.")

    output_name = build_output_name(source_files[0].filename, organize_plan.output_name)
    result = export_organized_pdf(sources, organize_plan)

    output_headers: dict[str, str] = {}
    if organize_plan.save_to_output_dir:
        try:
            output_path = get_output_path(output_name)
            output_path.write_bytes(result)
            output_name = output_path.name
            output_headers["X-Pdf-Output-Status"] = "saved"
        except OSError as error:
            logger.warning("Impossible d'écrire la copie PDF dans %s: %s", OUTPUT_DIR, error)
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

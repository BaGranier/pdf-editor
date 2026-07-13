from __future__ import annotations

import io
import json
import logging
import re
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, field_validator
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError


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


class OrganizeExportPlan(BaseModel):
    output_name: str | None = Field(default=None, alias="outputName")
    pages: list[OrganizeExportPage]
    save_to_output_dir: bool = Field(default=False, alias="saveToOutputDir")


PROJECT_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_DIR = PROJECT_ROOT / "data" / "output"
SAFE_OUTPUT_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._ -]*")
logger = logging.getLogger(__name__)

app = FastAPI(title="PDF Engine MVP")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Pdf-Output-Status", "X-Pdf-Output-Warning"],
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
        if not requested_name or "/" in requested_name or "\\" in requested_name:
            raise HTTPException(status_code=422, detail="Le nom de sortie est invalide.")

        name = re.sub(r"[^A-Za-z0-9._ -]", "-", Path(requested_name).name)
    else:
        source_stem = re.sub(r"[^A-Za-z0-9._ -]", "-", Path(upload_name or "document").stem)
        name = f"{source_stem.strip('. ') or 'document'}-modifie.pdf"

    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"

    if not SAFE_OUTPUT_NAME.fullmatch(name):
        raise HTTPException(status_code=422, detail="Le nom de sortie est invalide.")

    return name


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
        raise HTTPException(status_code=400, detail="Un fichier fourni n'est pas un PDF valide.") from error

    if reader.is_encrypted:
        raise HTTPException(status_code=400, detail="Les PDF protégés ne sont pas pris en charge.")

    return reader


def export_organized_pdf(sources: dict[str, bytes], plan: OrganizeExportPlan) -> bytes:
    if not plan.pages:
        raise HTTPException(status_code=422, detail="Le plan d'organisation ne contient aucune page.")

    readers = {document_id: read_source_pdf(source) for document_id, source in sources.items()}

    writer = PdfWriter()

    for page_plan in plan.pages:
        source_document_id = page_plan.source_document_id
        if source_document_id is None and len(readers) == 1:
            source_document_id = next(iter(readers))

        reader = readers.get(source_document_id or "")
        if reader is None:
            raise HTTPException(
                status_code=422,
                detail=f"Le document source {source_document_id!r} est introuvable.",
            )

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

    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


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
        headers={"Content-Disposition": f'attachment; filename="{output_name}"', **output_headers},
    )

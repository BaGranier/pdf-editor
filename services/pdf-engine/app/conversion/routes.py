from __future__ import annotations

import json
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.conversion.filenames import build_conversion_download_name
from app.conversion.models import DocxMode, OcrMode
from app.conversion.service import (
    build_options,
    cleanup_temporary_directory,
    prepare_conversion,
)


router = APIRouter()


@router.post("/convert", response_class=FileResponse)
async def convert_pdf(
    file: Annotated[UploadFile, File(description="PDF source à convertir")],
    target_format: Annotated[str, Form(description="docx, txt, html, png ou jpeg")],
    languages: Annotated[str, Form(description="fra, eng ou fra+eng")] = "fra",
    ocr_mode: Annotated[str, Form(description="auto, never ou always")] = (
        OcrMode.AUTO.value
    ),
    pages: Annotated[
        str | None,
        Form(description="Plage de pages, par exemple 1-3,5"),
    ] = None,
    image_dpi: Annotated[int, Form(description="96, 150 ou 300 dpi")] = 150,
    image_quality: Annotated[int, Form(description="Qualité JPEG de 1 à 100")] = 85,
    docx_mode: Annotated[
        str,
        Form(description="editable ou visual"),
    ] = DocxMode.EDITABLE.value,
    output_filename: Annotated[
        str | None,
        Form(description="Nom du fichier téléchargé, sans chemin"),
    ] = None,
) -> FileResponse:
    options = build_options(
        target_format=target_format,
        languages=languages,
        ocr_mode=ocr_mode,
        pages=pages,
        image_dpi=image_dpi,
        image_quality=image_quality,
        docx_mode=docx_mode,
    )
    prepared = await prepare_conversion(file, options)
    result = prepared.result
    try:
        download_name = build_conversion_download_name(
            source_filename=file.filename,
            requested_filename=output_filename,
            target_format=result.target_format,
            docx_mode=options.docx_mode,
            page_numbers=result.page_numbers,
        )
    except Exception:
        cleanup_temporary_directory(prepared.temporary_directory)
        raise
    headers = {
        "X-Conversion-Format": result.target_format.value,
        "X-Conversion-Duration-Ms": str(result.duration_ms),
        "X-Conversion-Input-Bytes": str(result.input_size),
        "X-Conversion-Output-Bytes": str(result.output_size),
        "X-Conversion-Ocr-Used": str(result.ocr_used).lower(),
        "X-Conversion-Pages": ",".join(map(str, result.page_numbers)),
        "X-Conversion-Warnings": quote(
            json.dumps(result.warnings, ensure_ascii=False),
        ),
        "X-Conversion-Text-Layer": result.text_layer.classification,
        "X-Conversion-Docx-Mode": options.docx_mode.value,
        "X-Conversion-Stage": "completed",
    }
    return FileResponse(
        prepared.artifact.path,
        media_type=prepared.artifact.media_type,
        filename=download_name,
        headers=headers,
        background=BackgroundTask(
            cleanup_temporary_directory,
            prepared.temporary_directory,
        ),
    )

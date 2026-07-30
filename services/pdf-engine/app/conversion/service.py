from __future__ import annotations

import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

import fitz
from fastapi import UploadFile
from pydantic import ValidationError

from app import ocr
from app.conversion.detector import detect_text_layer
from app.conversion.errors import ConversionError
from app.conversion.models import (
    ConversionArtifact,
    ConversionOptions,
    ConversionResult,
    OcrMode,
    PreparedConversion,
    parse_ocr_mode,
    parse_page_range,
    parse_target_format,
)


CONVERSION_TIMEOUT_SECONDS = 180
MAX_OUTPUT_SIZE_BYTES = 200 * 1024 * 1024


def create_temporary_directory() -> Path:
    return Path(tempfile.mkdtemp(prefix="pdf-engine-conversion-"))


def cleanup_temporary_directory(directory: Path) -> None:
    shutil.rmtree(directory, ignore_errors=True)


def build_options(
    *,
    target_format: str,
    languages: str,
    ocr_mode: str,
    pages: str | None,
    image_dpi: int,
    image_quality: int,
) -> ConversionOptions:
    parsed_target = parse_target_format(target_format)
    parsed_ocr_mode = parse_ocr_mode(ocr_mode)
    try:
        return ConversionOptions(
            target_format=parsed_target,
            languages=languages,
            ocr_mode=parsed_ocr_mode,
            pages=pages,
            image_dpi=image_dpi,
            image_quality=image_quality,
        )
    except ValidationError as error:
        raise ConversionError(
            status_code=422,
            code="CONVERSION_FAILED",
            message=error.errors()[0].get("msg", "Les options sont invalides."),
        ) from error


def _map_ocr_error(error: ocr.OcrError) -> ConversionError:
    if error.code == "INVALID_PDF":
        return ConversionError(400, "INVALID_PDF", error.message)
    if error.code in {"PDF_TOO_LARGE", "PDF_PAGE_LIMIT_EXCEEDED"}:
        return ConversionError(413, "OUTPUT_TOO_LARGE", error.message)
    if error.code in {"OCR_TOOL_UNAVAILABLE", "OCR_LANGUAGE_UNAVAILABLE"}:
        return ConversionError(
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Le moteur OCR ou la langue demandée n'est pas disponible.",
        )
    if error.code == "OCR_TIMEOUT":
        return ConversionError(
            504,
            "CONVERSION_TIMEOUT",
            "La conversion avec OCR a dépassé le délai autorisé.",
        )
    return ConversionError(
        502,
        "CONVERSION_FAILED",
        "La préparation OCR du document a échoué.",
        diagnostic=error.diagnostic,
    )


def create_selected_pdf(
    source_pdf: Path,
    destination: Path,
    page_indexes: list[int],
    page_count: int,
) -> Path:
    if page_indexes == list(range(page_count)):
        return source_pdf
    try:
        with fitz.open(source_pdf) as document:
            document.select(page_indexes)
            document.save(destination, garbage=4, deflate=True)
    except (fitz.FileDataError, RuntimeError, ValueError) as error:
        raise ConversionError(
            400,
            "INVALID_PDF",
            "Le fichier fourni n'est pas un PDF valide.",
        ) from error
    return destination


async def prepare_searchable_pdf(
    source_pdf: Path,
    output_pdf: Path,
    *,
    options: ConversionOptions,
    page_count: int,
    needs_ocr: bool,
    temporary_directory: Path,
) -> tuple[Path, bool]:
    should_run_ocr = (
        options.ocr_mode == OcrMode.ALWAYS
        or (options.ocr_mode == OcrMode.AUTO and needs_ocr)
    )
    if not should_run_ocr:
        return source_pdf, False

    mode = (
        "force-ocr"
        if options.ocr_mode == OcrMode.ALWAYS
        else "skip-text"
    )
    try:
        requested_languages = ocr.parse_languages(options.languages)
        installed_languages = await ocr.get_installed_languages()
        ocr.validate_languages_available(
            requested_languages,
            installed_languages,
        )
        command = ocr.build_ocr_command(
            source_pdf,
            output_pdf,
            languages=options.languages,
            mode=mode,
            deskew=True,
            jobs=ocr.calculate_ocr_jobs(page_count),
        )
        await ocr.execute_ocr(
            command,
            temporary_directory=temporary_directory,
        )
        ocr.validate_output_pdf(
            output_pdf,
            expected_page_count=page_count,
        )
    except ocr.OcrError as error:
        raise _map_ocr_error(error) from error
    return output_pdf, True


async def execute_conversion_worker(
    input_pdf: Path,
    output_directory: Path,
    options: ConversionOptions,
) -> ConversionArtifact:
    manifest_path = output_directory / "conversion-manifest.json"
    command = [
        sys.executable,
        "-m",
        "app.conversion.worker",
        "--input",
        str(input_pdf),
        "--output-directory",
        str(output_directory),
        "--target-format",
        options.target_format.value,
        "--dpi",
        str(options.image_dpi),
        "--quality",
        str(options.image_quality),
        "--manifest",
        str(manifest_path),
    ]
    try:
        return_code, _stdout, stderr = await ocr.capture_process(
            command,
            timeout_seconds=CONVERSION_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        raise ConversionError(
            504,
            "CONVERSION_TIMEOUT",
            "La conversion a dépassé le délai autorisé.",
        ) from error
    except (FileNotFoundError, OSError) as error:
        raise ConversionError(
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Le moteur de conversion n'est pas disponible.",
        ) from error

    if return_code != 0 or not manifest_path.is_file():
        diagnostic = ocr.decode_process_output(stderr)[-4000:].replace(
            str(output_directory),
            "<temporary-directory>",
        )
        raise ConversionError(
            502,
            "CONVERSION_FAILED",
            "Le document n'a pas pu être converti.",
            diagnostic=diagnostic,
        )
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        output_path = Path(manifest["path"]).resolve()
        if output_path.parent != output_directory.resolve():
            raise ValueError("unsafe worker output path")
        if not output_path.is_file() or output_path.stat().st_size == 0:
            raise ValueError("empty worker output")
        if output_path.stat().st_size > MAX_OUTPUT_SIZE_BYTES:
            raise ConversionError(
                413,
                "OUTPUT_TOO_LARGE",
                "Le résultat dépasse la taille autorisée.",
            )
        return ConversionArtifact(
            path=output_path,
            filename=str(manifest["filename"]),
            media_type=str(manifest["mediaType"]),
            warnings=tuple(str(item) for item in manifest["warnings"]),
        )
    except ConversionError:
        raise
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise ConversionError(
            502,
            "CONVERSION_FAILED",
            "Le moteur de conversion a produit un résultat invalide.",
        ) from error


async def prepare_conversion(
    file: UploadFile,
    options: ConversionOptions,
) -> PreparedConversion:
    started_at = time.perf_counter()
    temporary_directory = create_temporary_directory()
    cleanup_in_service = True
    input_path = temporary_directory / "input.pdf"

    try:
        try:
            await ocr.copy_uploaded_pdf(file, input_path)
            page_count = ocr.validate_source_pdf(input_path)
        except ocr.OcrError as error:
            raise _map_ocr_error(error) from error

        page_indexes = parse_page_range(options.pages, page_count)
        selected_path = create_selected_pdf(
            input_path,
            temporary_directory / "selected.pdf",
            page_indexes,
            page_count,
        )
        text_layer = detect_text_layer(
            selected_path,
            list(range(len(page_indexes))),
        )
        searchable_path, ocr_used = await prepare_searchable_pdf(
            selected_path,
            temporary_directory / "searchable.pdf",
            options=options,
            page_count=len(page_indexes),
            needs_ocr=bool(text_layer.image_only_pages),
            temporary_directory=temporary_directory,
        )
        artifact = await execute_conversion_worker(
            searchable_path,
            temporary_directory,
            options,
        )
        warnings = list(artifact.warnings)
        if (
            options.ocr_mode == OcrMode.NEVER
            and text_layer.image_only_pages
        ):
            warnings.append(
                "Certaines pages semblent numérisées et ont été converties sans OCR."
            )
        output_size = artifact.path.stat().st_size
        result = ConversionResult(
            target_format=options.target_format,
            page_numbers=[page_index + 1 for page_index in page_indexes],
            ocr_used=ocr_used,
            warnings=warnings,
            input_size=input_path.stat().st_size,
            output_size=output_size,
            duration_ms=round((time.perf_counter() - started_at) * 1000),
            text_layer=text_layer,
        )
        prepared = PreparedConversion(
            artifact=ConversionArtifact(
                path=artifact.path,
                filename=artifact.filename,
                media_type=artifact.media_type,
                warnings=tuple(warnings),
            ),
            temporary_directory=temporary_directory,
            result=result,
        )
        cleanup_in_service = False
        return prepared
    finally:
        if cleanup_in_service:
            cleanup_temporary_directory(temporary_directory)

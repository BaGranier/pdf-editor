from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Annotated, BinaryIO, Final

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse
from pypdf import PdfReader
from starlette.background import BackgroundTask

MAX_PDF_SIZE_BYTES: Final = 100 * 1024 * 1024
MAX_PDF_PAGES: Final = 500
OCR_TIMEOUT_SECONDS: Final = 600
OCR_MAX_JOBS: Final = 4
# OCRmyPDF 14 interprète 0 comme « toujours linéariser ».
OCR_FAST_WEB_VIEW_THRESHOLD_MB: Final = 1_000_000_000
TESSERACT_TIMEOUT_SECONDS: Final = 30
COPY_CHUNK_SIZE: Final = 1024 * 1024
PROCESS_OUTPUT_LIMIT_BYTES: Final = 64 * 1024
DIAGNOSTIC_STREAM_LOG_LIMIT_CHARS: Final = 4000
DIAGNOSTIC_LOG_LIMIT_CHARS: Final = 2 * DIAGNOSTIC_STREAM_LOG_LIMIT_CHARS + 32
SUPPORTED_OCR_MODES: Final = frozenset({"skip-text", "force-ocr"})
DEFAULT_OCR_MODE: Final = "force-ocr"
LANGUAGE_PATTERN: Final = re.compile(
    r"[A-Za-z0-9_]{2,32}(?:\+[A-Za-z0-9_]{2,32})*"
)

logger = logging.getLogger(__name__)
router = APIRouter()


class OcrError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        return_code: int | None = None,
        diagnostic: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.return_code = return_code
        self.diagnostic = diagnostic


def invalid_pdf(message: str = "Le fichier fourni n'est pas un PDF valide.") -> OcrError:
    return OcrError(status_code=400, code="INVALID_PDF", message=message)


def validate_mode(mode: str) -> str:
    if mode not in SUPPORTED_OCR_MODES:
        raise OcrError(
            status_code=422,
            code="OCR_INVALID_MODE",
            message="Le mode OCR doit être « skip-text » ou « force-ocr ».",
        )
    return mode


def parse_languages(languages: str) -> list[str]:
    if not languages or LANGUAGE_PATTERN.fullmatch(languages) is None:
        raise OcrError(
            status_code=422,
            code="OCR_INVALID_LANGUAGE",
            message="La liste des langues OCR est vide ou mal formée.",
        )

    requested_languages = languages.split("+")
    if len(set(requested_languages)) != len(requested_languages):
        raise OcrError(
            status_code=422,
            code="OCR_INVALID_LANGUAGE",
            message="La liste des langues OCR contient un doublon.",
        )
    return requested_languages


async def capture_process(
    command: list[str],
    *,
    timeout_seconds: int,
) -> tuple[int, bytes, bytes]:
    with tempfile.TemporaryFile() as stdout_file, tempfile.TemporaryFile() as stderr_file:
        process = subprocess.Popen(
            command,
            stdout=stdout_file,
            stderr=stderr_file,
            shell=False,
            start_new_session=os.name == "posix",
        )
        deadline = time.monotonic() + timeout_seconds
        try:
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    _kill_process_group(process)
                    while process.poll() is None:
                        await asyncio.sleep(0)
                    raise TimeoutError
                await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            _kill_process_group(process)
            while process.poll() is None:
                await asyncio.sleep(0)
            raise

        return (
            process.returncode or 0,
            _read_process_output_tail(stdout_file),
            _read_process_output_tail(stderr_file),
        )


def _kill_process_group(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return

    if os.name == "posix":
        try:
            os.killpg(process.pid, signal.SIGKILL)
            return
        except (AttributeError, OSError):
            pass

    process.kill()


def _read_process_output_tail(stream: BinaryIO) -> bytes:
    stream.seek(0, os.SEEK_END)
    output_size = stream.tell()
    stream.seek(max(0, output_size - PROCESS_OUTPUT_LIMIT_BYTES))
    return stream.read(PROCESS_OUTPUT_LIMIT_BYTES)


def decode_process_output(output: bytes) -> str:
    return output.decode("utf-8", errors="replace")


async def get_installed_languages() -> set[str]:
    try:
        return_code, stdout, stderr = await capture_process(
            ["tesseract", "--list-langs"],
            timeout_seconds=TESSERACT_TIMEOUT_SECONDS,
        )
    except (FileNotFoundError, OSError, TimeoutError) as error:
        raise OcrError(
            status_code=503,
            code="OCR_TOOL_UNAVAILABLE",
            message="Tesseract n'est pas disponible.",
        ) from error

    if return_code != 0:
        diagnostic = decode_process_output(stderr)[-2000:]
        logger.warning(
            "La détection des langues Tesseract a échoué (code %s): %s",
            return_code,
            diagnostic,
        )
        raise OcrError(
            status_code=503,
            code="OCR_TOOL_UNAVAILABLE",
            message="Tesseract n'est pas disponible.",
        )

    output = "\n".join(
        (decode_process_output(stdout), decode_process_output(stderr))
    )
    installed = {
        line.strip()
        for line in output.splitlines()
        if re.fullmatch(r"[A-Za-z0-9_]{2,32}", line.strip())
    }
    if not installed:
        raise OcrError(
            status_code=503,
            code="OCR_TOOL_UNAVAILABLE",
            message="Aucune langue Tesseract installée n'a pu être détectée.",
        )
    return installed


def validate_languages_available(
    requested_languages: list[str],
    installed_languages: set[str],
) -> None:
    unavailable = [
        language
        for language in requested_languages
        if language not in installed_languages
    ]
    if unavailable:
        raise OcrError(
            status_code=422,
            code="OCR_LANGUAGE_UNAVAILABLE",
            message=(
                "Langue OCR non installée : "
                + ", ".join(sorted(unavailable))
                + "."
            ),
        )


async def copy_uploaded_pdf(upload: UploadFile, destination: Path) -> None:
    size = 0
    try:
        with destination.open("xb") as output:
            while chunk := await upload.read(COPY_CHUNK_SIZE):
                size += len(chunk)
                if size > MAX_PDF_SIZE_BYTES:
                    raise OcrError(
                        status_code=413,
                        code="PDF_TOO_LARGE",
                        message="Le fichier PDF dépasse la limite de 100 Mo.",
                    )
                output.write(chunk)
    except OcrError:
        raise
    except Exception as error:
        raise invalid_pdf("Le fichier PDF envoyé n'a pas pu être lu.") from error

    if size == 0:
        raise invalid_pdf("Le fichier PDF envoyé est vide.")


def _read_pdf_page_count(path: Path) -> int:
    try:
        with path.open("rb") as pdf_file:
            if pdf_file.read(5) != b"%PDF-":
                raise invalid_pdf()
            pdf_file.seek(0)
            reader = PdfReader(pdf_file, strict=True)
            if reader.is_encrypted:
                raise invalid_pdf(
                    "Les PDF protégés ne sont pas pris en charge pour l'OCR."
                )
            return len(reader.pages)
    except OcrError:
        raise
    except Exception as error:
        raise invalid_pdf() from error


def validate_source_pdf(path: Path) -> int:
    page_count = _read_pdf_page_count(path)
    if page_count == 0:
        raise invalid_pdf("Le PDF fourni ne contient aucune page.")
    if page_count > MAX_PDF_PAGES:
        raise OcrError(
            status_code=422,
            code="PDF_PAGE_LIMIT_EXCEEDED",
            message="Le PDF dépasse la limite de 500 pages.",
        )
    return page_count


def calculate_ocr_jobs(page_count: int) -> int:
    return max(
        1,
        min(
            page_count,
            OCR_MAX_JOBS,
            os.cpu_count() or 1,
        ),
    )


def build_ocr_command(
    input_path: Path,
    output_path: Path,
    *,
    languages: str,
    mode: str,
    deskew: bool,
    jobs: int,
) -> list[str]:
    command = [
        "ocrmypdf",
        "--output-type",
        "pdf",
        "--optimize",
        "0",
        "--fast-web-view",
        str(OCR_FAST_WEB_VIEW_THRESHOLD_MB),
        "--jobs",
        str(jobs),
        "--language",
        languages,
        f"--{mode}",
    ]
    if deskew:
        command.append("--deskew")
    command.extend((str(input_path), str(output_path)))
    return command


def _safe_diagnostic(output: bytes, temporary_directory: Path) -> str:
    diagnostic = decode_process_output(output).replace(
        str(temporary_directory),
        "<temporary-directory>",
    )
    return diagnostic[-DIAGNOSTIC_STREAM_LOG_LIMIT_CHARS:]


async def execute_ocr(
    command: list[str],
    *,
    temporary_directory: Path,
) -> None:
    try:
        return_code, stdout, stderr = await capture_process(
            command,
            timeout_seconds=OCR_TIMEOUT_SECONDS,
        )
    except TimeoutError as error:
        raise OcrError(
            status_code=504,
            code="OCR_TIMEOUT",
            message="Le traitement OCR a dépassé le délai autorisé.",
        ) from error
    except FileNotFoundError as error:
        raise OcrError(
            status_code=503,
            code="OCR_TOOL_UNAVAILABLE",
            message="OCRmyPDF n'est pas disponible.",
        ) from error
    except OSError as error:
        raise OcrError(
            status_code=503,
            code="OCR_TOOL_UNAVAILABLE",
            message="OCRmyPDF n'a pas pu être démarré.",
        ) from error

    if return_code != 0:
        stdout_diagnostic = _safe_diagnostic(stdout, temporary_directory)
        stderr_diagnostic = _safe_diagnostic(stderr, temporary_directory)
        raise OcrError(
            status_code=502,
            code="OCR_FAILED",
            message="OCRmyPDF n'a pas pu traiter le document.",
            return_code=return_code,
            diagnostic=(
                f"stdout={stdout_diagnostic} stderr={stderr_diagnostic}"
            ),
        )


def validate_output_pdf(
    path: Path,
    *,
    expected_page_count: int | None = None,
) -> int:
    try:
        if not path.is_file() or path.stat().st_size == 0:
            raise OcrError(
                status_code=502,
                code="OCR_OUTPUT_INVALID",
                message="OCRmyPDF n'a produit aucun PDF exploitable.",
            )
        with path.open("rb") as pdf_file:
            if pdf_file.read(5) != b"%PDF-":
                raise OcrError(
                    status_code=502,
                    code="OCR_OUTPUT_INVALID",
                    message="Le fichier produit par OCRmyPDF n'est pas un PDF.",
                )
            pdf_file.seek(0)
            reader = PdfReader(pdf_file, strict=True)
            if len(reader.pages) == 0:
                raise OcrError(
                    status_code=502,
                    code="OCR_OUTPUT_INVALID",
                    message="Le PDF produit par OCRmyPDF ne contient aucune page.",
                )
            page_count = len(reader.pages)
            if (
                expected_page_count is not None
                and page_count != expected_page_count
            ):
                raise OcrError(
                    status_code=502,
                    code="OCR_OUTPUT_INVALID",
                    message=(
                        "Le PDF produit par OCRmyPDF ne conserve pas toutes les pages."
                    ),
                )
            return page_count
    except OcrError:
        raise
    except Exception as error:
        raise OcrError(
            status_code=502,
            code="OCR_OUTPUT_INVALID",
            message="Le PDF produit par OCRmyPDF est invalide.",
        ) from error


def build_ocr_output_name(upload_name: str | None) -> str:
    original_name = (upload_name or "document.pdf").replace("\\", "/")
    source_stem = Path(original_name).name
    if source_stem.lower().endswith(".pdf"):
        source_stem = source_stem[:-4]
    source_stem = re.sub(r"[\x00-\x1f\x7f]", "-", source_stem).strip(". ")
    return f"{source_stem or 'document'}_OCR.pdf"


def cleanup_temporary_directory(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)


async def cleanup_after_response(path: Path) -> None:
    cleanup_temporary_directory(path)


def create_temporary_directory() -> Path:
    return Path(tempfile.mkdtemp(prefix="pdf-engine-ocr-"))


@router.post("/ocr", response_class=FileResponse)
async def ocr_pdf(
    file: Annotated[UploadFile, File(description="PDF source à OCRiser")],
    languages: Annotated[str, Form(description="Langues Tesseract")] = "fra",
    mode: Annotated[
        str,
        Form(description="Mode OCR (force-ocr par défaut ; skip-text accepté explicitement)"),
    ] = DEFAULT_OCR_MODE,
    deskew: Annotated[bool, Form(description="Redresser les pages")] = True,
) -> FileResponse:
    request_started = time.perf_counter()
    validate_mode(mode)
    requested_languages = parse_languages(languages)

    temporary_directory = create_temporary_directory()
    cleanup_in_route = True
    input_path = temporary_directory / "input.pdf"
    output_path = temporary_directory / "output.pdf"
    page_count: int | None = None
    jobs: int | None = None
    source_validation_seconds = 0.0
    ocr_seconds = 0.0
    output_validation_seconds = 0.0

    try:
        source_validation_started = time.perf_counter()
        try:
            await copy_uploaded_pdf(file, input_path)
            page_count = validate_source_pdf(input_path)
        finally:
            source_validation_seconds = (
                time.perf_counter() - source_validation_started
            )

        jobs = calculate_ocr_jobs(page_count)
        installed_languages = await get_installed_languages()
        validate_languages_available(requested_languages, installed_languages)

        command = build_ocr_command(
            input_path,
            output_path,
            languages=languages,
            mode=mode,
            deskew=deskew,
            jobs=jobs,
        )
        ocr_started = time.perf_counter()
        try:
            await execute_ocr(command, temporary_directory=temporary_directory)
        finally:
            ocr_seconds = time.perf_counter() - ocr_started

        output_validation_started = time.perf_counter()
        try:
            validate_output_pdf(
                output_path,
                expected_page_count=page_count,
            )
        finally:
            output_validation_seconds = (
                time.perf_counter() - output_validation_started
            )

        response = FileResponse(
            output_path,
            media_type="application/pdf",
            filename=build_ocr_output_name(file.filename),
            background=BackgroundTask(
                cleanup_after_response,
                temporary_directory,
            ),
        )
        total_seconds = time.perf_counter() - request_started
        logger.info(
            "OCR completed: pages=%s jobs=%s deskew=%s languages=%s "
            "source_validation_seconds=%.2f ocr_seconds=%.2f "
            "output_validation_seconds=%.2f total_seconds=%.2f",
            page_count,
            jobs,
            str(deskew).lower(),
            languages,
            source_validation_seconds,
            ocr_seconds,
            output_validation_seconds,
            total_seconds,
        )
        cleanup_in_route = False
        return response
    except OcrError as error:
        total_seconds = time.perf_counter() - request_started
        diagnostic = (error.diagnostic or "-").replace(
            str(temporary_directory),
            "<temporary-directory>",
        )[-DIAGNOSTIC_LOG_LIMIT_CHARS:]
        logger.warning(
            "OCR failed: code=%s pages=%s jobs=%s deskew=%s languages=%s "
            "source_validation_seconds=%.2f ocr_seconds=%.2f "
            "output_validation_seconds=%.2f total_seconds=%.2f "
            "return_code=%s diagnostic=%s",
            error.code,
            page_count,
            jobs,
            str(deskew).lower(),
            languages,
            source_validation_seconds,
            ocr_seconds,
            output_validation_seconds,
            total_seconds,
            error.return_code,
            diagnostic,
        )
        raise
    finally:
        if cleanup_in_route:
            cleanup_temporary_directory(temporary_directory)

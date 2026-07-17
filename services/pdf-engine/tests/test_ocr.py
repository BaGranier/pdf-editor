from __future__ import annotations

import asyncio
import io
import json
import shutil
import tempfile
from pathlib import Path
from typing import Coroutine, TypeVar

import pytest
from fastapi import UploadFile
from pypdf import PdfReader, PdfWriter
from starlette.datastructures import Headers

from app import main, ocr

T = TypeVar("T")


def run(coroutine: Coroutine[object, object, T]) -> T:
    return asyncio.run(coroutine)


def make_pdf(page_count: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=200, height=200)
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def make_upload(content: bytes, name: str = "scan.pdf") -> UploadFile:
    upload_content = tempfile.SpooledTemporaryFile()
    upload_content.write(content)
    upload_content.seek(0)
    return UploadFile(
        file=upload_content,
        filename=name,
        headers=Headers({"content-type": "application/pdf"}),
    )


def assert_ocr_error(error: pytest.ExceptionInfo[ocr.OcrError], code: str) -> None:
    assert error.value.code == code


def track_temporary_directory(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Path:
    directory = tmp_path / "ocr-temporary-directory"

    def create_directory() -> Path:
        directory.mkdir()
        return directory

    monkeypatch.setattr(ocr, "create_temporary_directory", create_directory)
    return directory


def install_languages(
    monkeypatch: pytest.MonkeyPatch,
    languages: set[str] | None = None,
) -> None:
    async def get_languages() -> set[str]:
        return languages or {"fra", "eng"}

    monkeypatch.setattr(ocr, "get_installed_languages", get_languages)


def install_successful_ocr(
    monkeypatch: pytest.MonkeyPatch,
    output: bytes | None = None,
) -> list[list[str]]:
    commands: list[list[str]] = []

    async def execute(
        command: list[str],
        *,
        temporary_directory: Path,
    ) -> None:
        assert temporary_directory == Path(command[-1]).parent
        commands.append(command)
        Path(command[-1]).write_bytes(output or make_pdf())

    monkeypatch.setattr(ocr, "execute_ocr", execute)
    return commands


def test_missing_file_is_rejected_over_http() -> None:
    messages: list[dict[str, object]] = []

    async def call_app() -> None:
        request_sent = False

        async def receive() -> dict[str, object]:
            nonlocal request_sent
            if request_sent:
                return {"type": "http.disconnect"}
            request_sent = True
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(message: dict[str, object]) -> None:
            messages.append(message)

        await main.app(
            {
                "type": "http",
                "asgi": {"version": "3.0"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/ocr",
                "raw_path": b"/ocr",
                "query_string": b"",
                "headers": [(b"content-length", b"0")],
                "client": ("test", 123),
                "server": ("test", 80),
            },
            receive,
            send,
        )

    run(call_app())

    response_start = next(
        message for message in messages if message["type"] == "http.response.start"
    )
    assert response_start["status"] == 422


@pytest.mark.parametrize(
    "content",
    [
        b"not a pdf",
        b"%PDF-1.7\nthis file is corrupt",
    ],
    ids=["not-pdf", "corrupt-pdf"],
)
def test_invalid_pdf_is_rejected_and_cleaned(
    content: bytes,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)

    with pytest.raises(ocr.OcrError) as error:
        run(ocr.ocr_pdf(file=make_upload(content)))

    assert_ocr_error(error, "INVALID_PDF")
    assert not temporary_directory.exists()


def test_pdf_size_is_checked_while_copying(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    monkeypatch.setattr(ocr, "MAX_PDF_SIZE_BYTES", 10)

    with pytest.raises(ocr.OcrError) as error:
        run(ocr.ocr_pdf(file=make_upload(b"%PDF-" + b"x" * 10)))

    assert error.value.status_code == 413
    assert_ocr_error(error, "PDF_TOO_LARGE")
    assert not temporary_directory.exists()


def test_pdf_page_limit_is_enforced(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    monkeypatch.setattr(ocr, "MAX_PDF_PAGES", 1)

    with pytest.raises(ocr.OcrError) as error:
        run(ocr.ocr_pdf(file=make_upload(make_pdf(2))))

    assert_ocr_error(error, "PDF_PAGE_LIMIT_EXCEEDED")
    assert not temporary_directory.exists()


def test_invalid_mode_is_rejected() -> None:
    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_mode("redo-ocr")

    assert_ocr_error(error, "OCR_INVALID_MODE")


@pytest.mark.parametrize(
    "languages",
    ["", "fra++eng", "fra;eng", "--help", "fra+../eng", "fra eng", "fra+fra"],
)
def test_empty_or_malformed_languages_are_rejected(languages: str) -> None:
    with pytest.raises(ocr.OcrError) as error:
        ocr.parse_languages(languages)

    assert_ocr_error(error, "OCR_INVALID_LANGUAGE")


def test_unavailable_language_is_rejected() -> None:
    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_languages_available(["fra", "deu"], {"fra", "eng"})

    assert_ocr_error(error, "OCR_LANGUAGE_UNAVAILABLE")
    assert "deu" in error.value.message


def test_command_contains_mode_deskew_language_and_single_job() -> None:
    command = ocr.build_ocr_command(
        Path("input.pdf"),
        Path("output.pdf"),
        languages="fra+eng",
        mode="skip-text",
        deskew=True,
    )

    assert "--skip-text" in command
    assert "--force-ocr" not in command
    assert "--deskew" in command
    assert command[command.index("--language") + 1] == "fra+eng"
    assert command[command.index("--jobs") + 1] == "1"


def test_force_ocr_and_disabled_deskew_are_reflected_in_command() -> None:
    command = ocr.build_ocr_command(
        Path("input.pdf"),
        Path("output.pdf"),
        languages="eng",
        mode="force-ocr",
        deskew=False,
    )

    assert "--force-ocr" in command
    assert "--skip-text" not in command
    assert "--deskew" not in command


class FakeProcess:
    def __init__(
        self,
        *,
        return_code: int | None = 0,
    ) -> None:
        self.returncode = return_code
        self.killed = False

    def poll(self) -> int | None:
        return self.returncode

    def kill(self) -> None:
        self.killed = True
        self.returncode = -9


def test_process_is_started_without_a_shell(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def create_process(arguments: list[str], **options: object) -> FakeProcess:
        captured["arguments"] = arguments
        captured["options"] = options
        return FakeProcess()

    monkeypatch.setattr(ocr.subprocess, "Popen", create_process)

    result = run(ocr.capture_process(["ocrmypdf", "--version"], timeout_seconds=1))

    assert result[0] == 0
    assert captured["arguments"] == ["ocrmypdf", "--version"]
    assert captured["options"]["shell"] is False


def test_tesseract_unavailable_is_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def missing_process(
        command: list[str],
        *,
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes]:
        raise FileNotFoundError

    monkeypatch.setattr(ocr, "capture_process", missing_process)

    with pytest.raises(ocr.OcrError) as error:
        run(ocr.get_installed_languages())

    assert_ocr_error(error, "OCR_TOOL_UNAVAILABLE")


def test_tesseract_languages_are_parsed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def language_process(
        command: list[str],
        *,
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes]:
        assert command == ["tesseract", "--list-langs"]
        assert timeout_seconds == ocr.TESSERACT_TIMEOUT_SECONDS
        return 0, b"List of available languages (3):\neng\nfra\nosd\n", b""

    monkeypatch.setattr(ocr, "capture_process", language_process)

    assert run(ocr.get_installed_languages()) == {"eng", "fra", "osd"}


def test_missing_ocrmypdf_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    async def missing_process(
        command: list[str],
        *,
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes]:
        raise FileNotFoundError

    monkeypatch.setattr(ocr, "capture_process", missing_process)

    with pytest.raises(ocr.OcrError) as error:
        run(
            ocr.execute_ocr(
                ["ocrmypdf"],
                temporary_directory=Path("/temporary"),
            )
        )

    assert_ocr_error(error, "OCR_TOOL_UNAVAILABLE")


def test_nonzero_ocr_exit_is_reported(monkeypatch: pytest.MonkeyPatch) -> None:
    async def failed_process(
        command: list[str],
        *,
        timeout_seconds: int,
    ) -> tuple[int, bytes, bytes]:
        return 2, b"stdout", b"processing failed"

    monkeypatch.setattr(ocr, "capture_process", failed_process)

    with pytest.raises(ocr.OcrError) as error:
        run(
            ocr.execute_ocr(
                ["ocrmypdf"],
                temporary_directory=Path("/temporary"),
            )
        )

    assert_ocr_error(error, "OCR_FAILED")


def test_ocr_timeout_kills_process_and_is_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess(return_code=None)

    def create_process(arguments: list[str], **options: object) -> FakeProcess:
        return process

    monkeypatch.setattr(ocr.subprocess, "Popen", create_process)
    monkeypatch.setattr(ocr, "OCR_TIMEOUT_SECONDS", 0)

    with pytest.raises(ocr.OcrError) as error:
        run(
            ocr.execute_ocr(
                ["ocrmypdf"],
                temporary_directory=Path("/temporary"),
            )
        )

    assert_ocr_error(error, "OCR_TIMEOUT")
    assert process.killed


def test_absent_ocr_output_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_output_pdf(tmp_path / "missing.pdf")

    assert_ocr_error(error, "OCR_OUTPUT_INVALID")


def test_empty_ocr_output_is_rejected(tmp_path: Path) -> None:
    output = tmp_path / "empty.pdf"
    output.touch()

    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_output_pdf(output)

    assert_ocr_error(error, "OCR_OUTPUT_INVALID")


def test_non_pdf_ocr_output_is_rejected(tmp_path: Path) -> None:
    output = tmp_path / "output.pdf"
    output.write_bytes(b"not a pdf")

    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_output_pdf(output)

    assert_ocr_error(error, "OCR_OUTPUT_INVALID")


def test_corrupt_pdf_ocr_output_is_rejected(tmp_path: Path) -> None:
    output = tmp_path / "output.pdf"
    output.write_bytes(b"%PDF-1.7\ncorrupt")

    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_output_pdf(output)

    assert_ocr_error(error, "OCR_OUTPUT_INVALID")


def test_successful_response_has_pdf_type_name_and_deferred_cleanup(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    install_languages(monkeypatch)
    commands = install_successful_ocr(monkeypatch)
    source = make_pdf()
    upload = make_upload(source, "rapport scanné.pdf")

    response = run(
        ocr.ocr_pdf(
            file=upload,
            languages="fra+eng",
            mode="skip-text",
            deskew=True,
        )
    )

    assert response.media_type == "application/pdf"
    assert "rapport%20scann%C3%A9_OCR.pdf" in response.headers[
        "content-disposition"
    ]
    assert Path(response.path).read_bytes().startswith(b"%PDF-")
    assert temporary_directory.exists()
    assert commands[0][commands[0].index("--language") + 1] == "fra+eng"
    upload.file.seek(0)
    assert upload.file.read() == source

    assert response.background is not None
    run(response.background())
    assert not temporary_directory.exists()


@pytest.mark.parametrize("code", ["OCR_FAILED", "OCR_TIMEOUT"])
def test_cleanup_after_ocr_error_or_timeout(
    code: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    install_languages(monkeypatch)

    async def fail_ocr(
        command: list[str],
        *,
        temporary_directory: Path,
    ) -> None:
        status_code = 504 if code == "OCR_TIMEOUT" else 502
        raise ocr.OcrError(status_code, code, "failure")

    monkeypatch.setattr(ocr, "execute_ocr", fail_ocr)

    with pytest.raises(ocr.OcrError) as error:
        run(ocr.ocr_pdf(file=make_upload(make_pdf())))

    assert_ocr_error(error, code)
    assert not temporary_directory.exists()


def test_ocr_errors_have_a_stable_json_shape() -> None:
    error = ocr.OcrError(502, "OCR_FAILED", "Le traitement a échoué.")

    response = run(main.handle_ocr_error(None, error))  # type: ignore[arg-type]

    assert response.status_code == 502
    assert json.loads(response.body) == {
        "code": "OCR_FAILED",
        "message": "Le traitement a échoué.",
    }


OCR_BINARIES = ("ocrmypdf", "tesseract", "gs", "qpdf")
OCR_BINARIES_AVAILABLE = all(shutil.which(binary) for binary in OCR_BINARIES)


@pytest.mark.integration
@pytest.mark.skipif(
    not OCR_BINARIES_AVAILABLE,
    reason="OCRmyPDF, Tesseract, Ghostscript et qpdf sont requis.",
)
def test_real_ocrmypdf_integration() -> None:
    response = run(
        ocr.ocr_pdf(
            file=make_upload(make_pdf(), "integration.pdf"),
            languages="eng",
            mode="force-ocr",
            deskew=False,
        )
    )

    try:
        output_path = Path(response.path)
        assert output_path.is_file()
        assert len(PdfReader(output_path).pages) == 1
    finally:
        assert response.background is not None
        run(response.background())

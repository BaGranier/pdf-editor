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
        input_page_count = len(PdfReader(command[-2]).pages)
        Path(command[-1]).write_bytes(output or make_pdf(input_page_count))

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


def test_source_validation_returns_the_page_count(tmp_path: Path) -> None:
    source = tmp_path / "source.pdf"
    source.write_bytes(make_pdf(3))

    assert ocr.validate_source_pdf(source) == 3


def test_invalid_mode_is_rejected() -> None:
    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_mode("redo-ocr")

    assert_ocr_error(error, "OCR_INVALID_MODE")


def test_openapi_documents_force_ocr_as_the_default_mode() -> None:
    schema = main.app.openapi()
    request_schema = schema["components"]["schemas"]["Body_ocr_pdf_ocr_post"]
    mode_schema = request_schema["properties"]["mode"]

    assert mode_schema["default"] == "force-ocr"
    assert "force-ocr par défaut" in mode_schema["description"]


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


@pytest.mark.parametrize(
    ("page_count", "cpu_count", "expected_jobs"),
    [
        (0, 8, 1),
        (1, 8, 1),
        (2, 2, 2),
        (3, 8, 3),
        (10, 8, 4),
        (100, 1, 1),
        (100, None, 1),
    ],
)
def test_ocr_jobs_are_bounded_by_pages_cpus_and_maximum(
    page_count: int,
    cpu_count: int | None,
    expected_jobs: int,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(ocr.os, "cpu_count", lambda: cpu_count)

    assert ocr.calculate_ocr_jobs(page_count) == expected_jobs
    assert 1 <= ocr.calculate_ocr_jobs(page_count) <= ocr.OCR_MAX_JOBS


def test_explicit_skip_text_remains_supported() -> None:
    command = ocr.build_ocr_command(
        Path("input.pdf"),
        Path("output.pdf"),
        languages="fra+eng",
        mode="skip-text",
        deskew=True,
        jobs=3,
    )

    assert command[:7] == [
        "ocrmypdf",
        "--output-type",
        "pdf",
        "--optimize",
        "0",
        "--fast-web-view",
        str(ocr.OCR_FAST_WEB_VIEW_THRESHOLD_MB),
    ]
    assert "--skip-text" in command
    assert "--force-ocr" not in command
    assert command.count("--skip-text") == 1
    assert "--deskew" in command
    assert command[command.index("--language") + 1] == "fra+eng"
    assert command[command.index("--jobs") + 1] == "3"
    assert "--pages" not in command


def test_force_ocr_and_disabled_deskew_are_reflected_in_command() -> None:
    command = ocr.build_ocr_command(
        Path("input.pdf"),
        Path("output.pdf"),
        languages="eng",
        mode="force-ocr",
        deskew=False,
        jobs=2,
    )

    assert "--force-ocr" in command
    assert "--skip-text" not in command
    assert command.count("--force-ocr") == 1
    assert "--deskew" not in command


class FakeProcess:
    def __init__(
        self,
        *,
        return_code: int | None = 0,
    ) -> None:
        self.returncode = return_code
        self.killed = False
        self.pid = 12345

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
    assert captured["options"]["start_new_session"] is True


def test_process_diagnostics_are_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    prefix = b"x" * ocr.PROCESS_OUTPUT_LIMIT_BYTES
    stdout_tail = b"stdout-tail"
    stderr_tail = b"stderr-tail"

    def create_process(arguments: list[str], **options: object) -> FakeProcess:
        options["stdout"].write(prefix + stdout_tail)  # type: ignore[union-attr]
        options["stderr"].write(prefix + stderr_tail)  # type: ignore[union-attr]
        return FakeProcess()

    monkeypatch.setattr(ocr.subprocess, "Popen", create_process)

    _, stdout, stderr = run(
        ocr.capture_process(["ocrmypdf", "--version"], timeout_seconds=1)
    )

    assert len(stdout) == ocr.PROCESS_OUTPUT_LIMIT_BYTES
    assert len(stderr) == ocr.PROCESS_OUTPUT_LIMIT_BYTES
    assert stdout.endswith(stdout_tail)
    assert stderr.endswith(stderr_tail)


def test_safe_diagnostic_is_redacted_and_bounded(tmp_path: Path) -> None:
    diagnostic = (
        "x" * ocr.DIAGNOSTIC_STREAM_LOG_LIMIT_CHARS
        + f" {tmp_path}/input.pdf"
    ).encode()

    sanitized = ocr._safe_diagnostic(diagnostic, tmp_path)

    assert str(tmp_path) not in sanitized
    assert "<temporary-directory>/input.pdf" in sanitized
    assert len(sanitized) <= ocr.DIAGNOSTIC_STREAM_LOG_LIMIT_CHARS


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
        assert timeout_seconds == 600
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
    assert error.value.return_code == 2
    assert error.value.diagnostic == "stdout=stdout stderr=processing failed"


def test_ocr_timeout_kills_process_and_is_reported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    process = FakeProcess(return_code=None)

    def create_process(arguments: list[str], **options: object) -> FakeProcess:
        return process

    killed_groups: list[tuple[int, int]] = []

    def kill_group(process_id: int, kill_signal: int) -> None:
        killed_groups.append((process_id, kill_signal))
        process.killed = True
        process.returncode = -kill_signal

    monkeypatch.setattr(ocr.subprocess, "Popen", create_process)
    monkeypatch.setattr(ocr.os, "killpg", kill_group)
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
    assert killed_groups == [(process.pid, ocr.signal.SIGKILL)]


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


def test_ocr_output_must_preserve_the_source_page_count(tmp_path: Path) -> None:
    output = tmp_path / "output.pdf"
    output.write_bytes(make_pdf(2))

    with pytest.raises(ocr.OcrError) as error:
        ocr.validate_output_pdf(output, expected_page_count=3)

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
    assert "--skip-text" in commands[0]
    assert "--force-ocr" not in commands[0]
    upload.file.seek(0)
    assert upload.file.read() == source

    assert response.background is not None
    run(response.background())
    assert not temporary_directory.exists()


def test_omitted_mode_uses_force_ocr_for_the_complete_pdf(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    install_languages(monkeypatch)
    commands = install_successful_ocr(monkeypatch)
    monkeypatch.setattr(ocr.os, "cpu_count", lambda: 8)

    response = run(
        ocr.ocr_pdf(
            file=make_upload(make_pdf(2), "document-mixte.pdf"),
            languages="fra",
            deskew=True,
        )
    )

    command = commands[0]
    assert "--force-ocr" in command
    assert "--skip-text" not in command
    assert command.count("--force-ocr") == 1
    assert "--deskew" in command
    assert "--pages" not in command
    assert command[command.index("--jobs") + 1] == "2"
    assert command[command.index("--optimize") + 1] == "0"
    assert command[command.index("--fast-web-view") + 1] == str(
        ocr.OCR_FAST_WEB_VIEW_THRESHOLD_MB
    )
    assert command[-2:] == [
        str(temporary_directory / "input.pdf"),
        str(temporary_directory / "output.pdf"),
    ]

    assert response.background is not None
    run(response.background())
    assert not temporary_directory.exists()


def test_success_log_contains_pages_jobs_and_stage_durations(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    install_languages(monkeypatch)
    install_successful_ocr(monkeypatch)
    monkeypatch.setattr(ocr.os, "cpu_count", lambda: 8)

    with caplog.at_level("INFO", logger="app.ocr"):
        response = run(
            ocr.ocr_pdf(
                file=make_upload(make_pdf(3)),
                languages="fra",
                deskew=True,
            )
        )

    message = next(
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("OCR completed:")
    )
    assert "pages=3 jobs=3 deskew=true languages=fra" in message
    assert "source_validation_seconds=" in message
    assert "ocr_seconds=" in message
    assert "output_validation_seconds=" in message
    assert "total_seconds=" in message
    assert str(temporary_directory) not in message
    for field in (
        "source_validation_seconds=",
        "ocr_seconds=",
        "output_validation_seconds=",
        "total_seconds=",
    ):
        assert float(message.split(field, maxsplit=1)[1].split()[0]) >= 0

    assert response.background is not None
    run(response.background())


def test_failure_log_is_bounded_and_does_not_expose_temporary_paths(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    temporary_directory = track_temporary_directory(monkeypatch, tmp_path)
    install_languages(monkeypatch)
    monkeypatch.setattr(ocr.os, "cpu_count", lambda: 8)

    async def fail_ocr(
        command: list[str],
        *,
        temporary_directory: Path,
    ) -> None:
        raise ocr.OcrError(
            502,
            "OCR_FAILED",
            "failure",
            return_code=2,
            diagnostic=(
                f"{temporary_directory}/input.pdf " + "x" * 10_000
            ),
        )

    monkeypatch.setattr(ocr, "execute_ocr", fail_ocr)

    with caplog.at_level("WARNING", logger="app.ocr"):
        with pytest.raises(ocr.OcrError):
            run(ocr.ocr_pdf(file=make_upload(make_pdf(3))))

    message = next(
        record.getMessage()
        for record in caplog.records
        if record.getMessage().startswith("OCR failed:")
    )
    assert "pages=3 jobs=3" in message
    assert "return_code=2" in message
    assert str(temporary_directory) not in message
    assert "<temporary-directory>" not in message
    assert len(message) < ocr.DIAGNOSTIC_LOG_LIMIT_CHARS + 1000


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

from __future__ import annotations

import asyncio
import io
import tempfile
from collections.abc import Callable, Coroutine
from pathlib import Path
from typing import TypeVar

import pytest
from fastapi import HTTPException, UploadFile
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, TextStringObject
from starlette.datastructures import Headers

from app import main, ocr
from app.conversion.errors import ConversionError
from app.conversion.models import ConversionOptions, OcrMode, TargetFormat
from app.conversion.service import cleanup_temporary_directory, prepare_conversion

T = TypeVar("T")


def run(coroutine: Coroutine[object, object, T]) -> T:
    return asyncio.run(coroutine)


def make_upload(source: bytes, name: str = "source.pdf") -> UploadFile:
    content = tempfile.SpooledTemporaryFile()
    content.write(source)
    content.seek(0)
    return UploadFile(
        file=content,
        filename=name,
        headers=Headers({"content-type": "application/pdf"}),
    )


def make_pdf(
    *,
    width: float = 200,
    height: float = 200,
    metadata_size: int = 0,
) -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    if metadata_size:
        writer.add_metadata({"/Title": "M" * metadata_size})
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


def make_malformed_acroform() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    writer._root_object[NameObject("/AcroForm")] = DictionaryObject(
        {NameObject("/Fields"): TextStringObject("not-an-array")}
    )
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


MALFORMED_PDF_SOURCES = {
    "empty": b"",
    "renamed-text": b"this is not a PDF",
    "truncated": b"%PDF-1.7\n1 0 obj << /Type /Catalog >>\n",
    "invalid-xref": (
        b"%PDF-1.7\nxref\n0 1\n0000000000 65535 f\n"
        b"trailer << /Size 999999999 >>\nstartxref\n0\n%%EOF"
    ),
    "incoherent-object": b"%PDF-1.7\n1 0 obj << /Type /Page /Contents 2 0 R >>\n",
}


def make_plan() -> main.OrganizeExportPlan:
    return main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": 0}]}
    )


def temporary_directory_factory(
    root: Path,
    prefix: str,
) -> tuple[Callable[[], Path], list[Path]]:
    directories: list[Path] = []

    def create_directory() -> Path:
        directory = root / f"{prefix}-{len(directories)}"
        directory.mkdir()
        directories.append(directory)
        return directory

    return create_directory, directories


@pytest.mark.parametrize(
    ("case_name", "source"),
    [
        pytest.param(case_name, source, id=case_name)
        for case_name, source in MALFORMED_PDF_SOURCES.items()
    ],
)
def test_malformed_pdf_corpus_is_rejected_and_temporary_directories_are_cleaned(
    case_name: str,
    source: bytes,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    create_ocr_directory, ocr_directories = temporary_directory_factory(
        tmp_path, "ocr"
    )
    create_conversion_directory, conversion_directories = temporary_directory_factory(
        tmp_path, "conversion"
    )
    monkeypatch.setattr(ocr, "create_temporary_directory", create_ocr_directory)
    monkeypatch.setattr(
        "app.conversion.service.create_temporary_directory",
        create_conversion_directory,
    )

    with pytest.raises(ocr.OcrError) as ocr_error:
        run(ocr.ocr_pdf(file=make_upload(source)))
    assert ocr_error.value.code == "INVALID_PDF"

    with pytest.raises(ConversionError) as conversion_error:
        run(
            prepare_conversion(
                make_upload(source),
                ConversionOptions(
                    target_format=TargetFormat.TXT,
                    ocr_mode=OcrMode.NEVER,
                ),
            )
        )
    assert conversion_error.value.code == "INVALID_PDF"
    assert conversion_error.value.stage == (
        "upload_read" if case_name == "empty" else "pdf_validation"
    )

    with pytest.raises(HTTPException) as export_error:
        main.export_organized_pdf({"source": source}, make_plan())
    assert export_error.value.status_code == 400

    with pytest.raises(HTTPException) as forms_error:
        run(main.extract_pdf_form_fields(make_upload(source), 0))
    assert forms_error.value.status_code in {400, 422}
    assert all(not directory.exists() for directory in ocr_directories)
    assert all(not directory.exists() for directory in conversion_directories)
    assert main.health().status == "ok"


def test_malformed_acroform_is_rejected_without_poisoning_the_next_request() -> None:
    with pytest.raises(HTTPException) as error:
        run(main.extract_pdf_form_fields(make_upload(make_malformed_acroform()), 0))
    assert error.value.status_code == 422
    assert error.value.detail == "Les champs AcroForm du PDF sont illisibles."

    response = run(main.extract_pdf_form_fields(make_upload(make_pdf()), 0))
    assert response == {"fields": []}
    assert main.health().status == "ok"


@pytest.mark.parametrize(
    ("source", "description"),
    [
        (make_pdf(width=1_000_000, height=1_000_000), "extreme-page-size"),
        (make_pdf(metadata_size=256 * 1024), "large-metadata"),
    ],
    ids=["extreme-page-size", "large-metadata"],
)
def test_unusual_but_valid_pdf_structures_remain_processable(
    source: bytes,
    description: str,
) -> None:
    reader = main.read_source_pdf(source)
    assert len(reader.pages) == 1, description
    exported = main.export_organized_pdf({"source": source}, make_plan())
    assert len(PdfReader(io.BytesIO(exported)).pages) == 1
    assert main.health().status == "ok"


def test_ocr_and_conversion_recover_after_a_rejected_pdf(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    create_ocr_directory, ocr_directories = temporary_directory_factory(
        tmp_path, "ocr-recovery"
    )
    create_conversion_directory, conversion_directories = temporary_directory_factory(
        tmp_path, "conversion-recovery"
    )
    monkeypatch.setattr(ocr, "create_temporary_directory", create_ocr_directory)
    monkeypatch.setattr(
        "app.conversion.service.create_temporary_directory",
        create_conversion_directory,
    )

    with pytest.raises(ocr.OcrError):
        run(ocr.ocr_pdf(file=make_upload(MALFORMED_PDF_SOURCES["truncated"])))
    with pytest.raises(ConversionError):
        run(
            prepare_conversion(
                make_upload(MALFORMED_PDF_SOURCES["truncated"]),
                ConversionOptions(target_format=TargetFormat.TXT, ocr_mode=OcrMode.NEVER),
            )
        )

    async def installed_languages() -> set[str]:
        return {"eng"}

    async def successful_ocr(
        command: list[str], *, temporary_directory: Path
    ) -> None:
        assert temporary_directory == Path(command[-1]).parent
        Path(command[-1]).write_bytes(make_pdf())

    monkeypatch.setattr(ocr, "get_installed_languages", installed_languages)
    monkeypatch.setattr(ocr, "execute_ocr", successful_ocr)
    ocr_response = run(ocr.ocr_pdf(file=make_upload(make_pdf()), languages="eng"))
    assert Path(ocr_response.path).is_file()
    assert ocr_response.background is not None
    run(ocr_response.background())

    prepared = run(
        prepare_conversion(
            make_upload(make_pdf()),
            ConversionOptions(target_format=TargetFormat.TXT, ocr_mode=OcrMode.NEVER),
        )
    )
    try:
        assert prepared.artifact.path.is_file()
    finally:
        cleanup_temporary_directory(prepared.temporary_directory)

    assert all(not directory.exists() for directory in ocr_directories)
    assert all(not directory.exists() for directory in conversion_directories)
    assert main.health().status == "ok"


def test_cancelling_a_subprocess_capture_terminates_its_process_group(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class PendingProcess:
        pid = 42
        returncode: int | None = None

        def poll(self) -> int | None:
            return self.returncode

        def kill(self) -> None:
            self.returncode = -9

    process = PendingProcess()
    killed_groups: list[tuple[int, int]] = []

    def create_process(*_args: object, **_kwargs: object) -> PendingProcess:
        return process

    def kill_group(process_id: int, kill_signal: int) -> None:
        killed_groups.append((process_id, kill_signal))
        process.returncode = -kill_signal

    async def cancel_capture() -> None:
        task = asyncio.create_task(
            ocr.capture_process(["synthetic-process"], timeout_seconds=30)
        )
        await asyncio.sleep(0)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    monkeypatch.setattr(ocr.subprocess, "Popen", create_process)
    monkeypatch.setattr(ocr.os, "killpg", kill_group)
    run(cancel_capture())

    assert killed_groups == [(process.pid, ocr.signal.SIGKILL)]
    assert process.returncode == -ocr.signal.SIGKILL

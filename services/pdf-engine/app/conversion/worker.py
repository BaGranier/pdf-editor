from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.conversion.docx_converter import PdfToDocxConverter
from app.conversion.image_converter import PdfToImageConverter
from app.conversion.models import TargetFormat
from app.conversion.text_converter import (
    PdfToHtmlConverter,
    PdfToTextConverter,
)


def run_worker(
    input_pdf: Path,
    output_directory: Path,
    target_format: TargetFormat,
    dpi: int,
    quality: int,
) -> dict[str, object]:
    if target_format == TargetFormat.DOCX:
        artifact = PdfToDocxConverter().convert(
            input_pdf,
            output_directory / "conversion.docx",
        )
    elif target_format == TargetFormat.TXT:
        artifact = PdfToTextConverter().convert(
            input_pdf,
            output_directory / "conversion.txt",
        )
    elif target_format == TargetFormat.HTML:
        artifact = PdfToHtmlConverter().convert(
            input_pdf,
            output_directory / "conversion.html",
        )
    else:
        artifact = PdfToImageConverter().convert(
            input_pdf,
            output_directory,
            target_format=target_format,
            dpi=dpi,
            quality=quality,
        )
    return {
        "path": str(artifact.path),
        "filename": artifact.filename,
        "mediaType": artifact.media_type,
        "warnings": list(artifact.warnings),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    parser.add_argument("--target-format", type=TargetFormat, required=True)
    parser.add_argument("--dpi", type=int, required=True)
    parser.add_argument("--quality", type=int, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    arguments = parser.parse_args()
    result = run_worker(
        arguments.input,
        arguments.output_directory,
        arguments.target_format,
        arguments.dpi,
        arguments.quality,
    )
    arguments.manifest.write_text(json.dumps(result), encoding="utf-8")


if __name__ == "__main__":
    main()

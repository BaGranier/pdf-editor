from __future__ import annotations

import zipfile
from pathlib import Path

import fitz

from app.conversion.errors import ConversionError
from app.conversion.models import ConversionArtifact, TargetFormat


MAX_OUTPUT_SIZE_BYTES = 200 * 1024 * 1024


class PdfToImageConverter:
    def convert(
        self,
        input_pdf: Path,
        output_directory: Path,
        *,
        target_format: TargetFormat,
        dpi: int,
        quality: int,
    ) -> ConversionArtifact:
        extension = "jpg" if target_format == TargetFormat.JPEG else "png"
        generated: list[Path] = []
        with fitz.open(input_pdf) as document:
            for page_number, page in enumerate(document, start=1):
                pixmap = page.get_pixmap(dpi=dpi, alpha=False)
                output_path = (
                    output_directory
                    / f"document_page_{page_number:04d}.{extension}"
                )
                if target_format == TargetFormat.JPEG:
                    pixmap.save(output_path, jpg_quality=quality)
                else:
                    pixmap.save(output_path)
                generated.append(output_path)

        if len(generated) == 1:
            generated[0].rename(
                output_directory / f"conversion_page_0001.{extension}"
            )
            output_path = output_directory / f"conversion_page_0001.{extension}"
            return ConversionArtifact(
                path=output_path,
                filename=output_path.name,
                media_type=f"image/{'jpeg' if extension == 'jpg' else 'png'}",
            )

        archive_path = output_directory / "conversion_images.zip"
        with zipfile.ZipFile(
            archive_path,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        ) as archive:
            for image_path in generated:
                archive_info = zipfile.ZipInfo(
                    image_path.name,
                    date_time=(1980, 1, 1, 0, 0, 0),
                )
                archive_info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(archive_info, image_path.read_bytes())
                if archive_path.stat().st_size > MAX_OUTPUT_SIZE_BYTES:
                    raise ConversionError(
                        status_code=413,
                        code="OUTPUT_TOO_LARGE",
                        message="L'archive d'images dépasse la taille autorisée.",
                    )
        return ConversionArtifact(
            path=archive_path,
            filename=archive_path.name,
            media_type="application/zip",
        )

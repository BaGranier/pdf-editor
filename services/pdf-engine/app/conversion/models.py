from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field, field_validator

from app.conversion.errors import ConversionError


class TargetFormat(StrEnum):
    DOCX = "docx"
    TXT = "txt"
    HTML = "html"
    PNG = "png"
    JPEG = "jpeg"


class OcrMode(StrEnum):
    AUTO = "auto"
    NEVER = "never"
    ALWAYS = "always"


SUPPORTED_LANGUAGES = frozenset({"fra", "eng", "fra+eng"})
SUPPORTED_IMAGE_DPI = frozenset({96, 150, 300})


class ConversionOptions(BaseModel):
    target_format: TargetFormat
    languages: str = "fra"
    ocr_mode: OcrMode = OcrMode.AUTO
    pages: str | None = None
    image_dpi: int = 150
    image_quality: int = Field(default=85, ge=1, le=100)

    @field_validator("languages")
    @classmethod
    def validate_languages(cls, value: str) -> str:
        if value not in SUPPORTED_LANGUAGES:
            raise ValueError("La langue OCR doit être fra, eng ou fra+eng.")
        return value

    @field_validator("image_dpi")
    @classmethod
    def validate_image_dpi(cls, value: int) -> int:
        if value not in SUPPORTED_IMAGE_DPI:
            raise ValueError("La résolution doit être 96, 150 ou 300 dpi.")
        return value


class TextLayerReport(BaseModel):
    classification: str
    exploitable_pages: list[int]
    image_only_pages: list[int]


class ConversionResult(BaseModel):
    target_format: TargetFormat
    page_numbers: list[int]
    ocr_used: bool
    warnings: list[str] = Field(default_factory=list)
    input_size: int
    output_size: int
    duration_ms: int
    text_layer: TextLayerReport


@dataclass(frozen=True)
class ConversionArtifact:
    path: Path
    filename: str
    media_type: str
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class PreparedConversion:
    artifact: ConversionArtifact
    temporary_directory: Path
    result: ConversionResult


def parse_target_format(value: str) -> TargetFormat:
    try:
        return TargetFormat(value)
    except ValueError as error:
        raise ConversionError(
            status_code=422,
            code="UNSUPPORTED_TARGET_FORMAT",
            message="Le format demandé n'est pas pris en charge.",
        ) from error


def parse_ocr_mode(value: str) -> OcrMode:
    try:
        return OcrMode(value)
    except ValueError as error:
        raise ConversionError(
            status_code=422,
            code="CONVERSION_FAILED",
            message="Le mode OCR doit être auto, never ou always.",
        ) from error


def parse_page_range(value: str | None, page_count: int) -> list[int]:
    if value is None or not value.strip() or value.strip().lower() == "all":
        return list(range(page_count))

    selected: list[int] = []
    seen: set[int] = set()
    try:
        for raw_part in value.split(","):
            part = raw_part.strip()
            if not part:
                raise ValueError
            if "-" in part:
                bounds = part.split("-")
                if len(bounds) != 2:
                    raise ValueError
                first, last = (int(bound.strip()) for bound in bounds)
                if first > last:
                    raise ValueError
                page_numbers = range(first, last + 1)
            else:
                page_numbers = (int(part),)

            for page_number in page_numbers:
                if page_number < 1 or page_number > page_count:
                    raise ValueError
                page_index = page_number - 1
                if page_index not in seen:
                    selected.append(page_index)
                    seen.add(page_index)
    except ValueError as error:
        raise ConversionError(
            status_code=422,
            code="INVALID_PAGE_RANGE",
            message=(
                "La plage de pages est invalide. Utilisez par exemple 1-3,5."
            ),
        ) from error

    if not selected:
        raise ConversionError(
            status_code=422,
            code="INVALID_PAGE_RANGE",
            message="La plage de pages ne contient aucune page.",
        )
    return selected

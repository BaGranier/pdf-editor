from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from app.conversion.errors import ConversionError
from app.conversion.models import DocxMode, TargetFormat


DEFAULT_OUTPUT_STEM = "document-converti"
MAX_OUTPUT_FILENAME_LENGTH = 160
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
_FORBIDDEN_CHARACTERS = re.compile(r'[/\\:*?"<>|]')
_REPEATED_REPLACEMENTS = re.compile(r"(?:\s*-\s*){2,}")
_KNOWN_EXTENSIONS = {
    ".docx",
    ".html",
    ".htm",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".txt",
    ".zip",
}
_WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{number}" for number in range(1, 10)),
    *(f"LPT{number}" for number in range(1, 10)),
}


def _strip_extension(value: str, *, any_extension: bool = False) -> str:
    suffix = Path(value).suffix.lower()
    if suffix in _KNOWN_EXTENSIONS or (
        any_extension and re.fullmatch(r"\.[a-z0-9]{1,10}", suffix)
    ):
        return value[: -len(suffix)]
    return value


def normalize_output_stem(
    value: str,
    *,
    fallback: str = DEFAULT_OUTPUT_STEM,
    strip_any_extension: bool = False,
) -> str:
    normalized = unicodedata.normalize("NFC", value)
    normalized = normalized.replace("\\", "/").rsplit("/", 1)[-1]
    normalized = normalized.strip()
    normalized = _strip_extension(
        normalized,
        any_extension=strip_any_extension,
    )
    normalized = _CONTROL_CHARACTERS.sub("", normalized)
    normalized = _FORBIDDEN_CHARACTERS.sub("-", normalized)
    normalized = _REPEATED_REPLACEMENTS.sub("-", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .-")

    if not normalized:
        normalized = fallback
    if normalized.upper() in _WINDOWS_RESERVED_NAMES:
        normalized = f"{normalized}-document"
    return normalized


def _truncate_stem(stem: str, suffix: str) -> str:
    available_length = MAX_OUTPUT_FILENAME_LENGTH - len(suffix)
    truncated = stem[:available_length].rstrip(" .-")
    return truncated or DEFAULT_OUTPUT_STEM


def build_conversion_download_name(
    *,
    source_filename: str | None,
    requested_filename: str | None,
    target_format: TargetFormat,
    docx_mode: DocxMode,
    page_numbers: list[int],
) -> str:
    if requested_filename is not None and not requested_filename.strip():
        raise ConversionError(
            status_code=422,
            code="INVALID_OUTPUT_FILENAME",
            message="Le nom du fichier de sortie ne peut pas être vide.",
            stage="output_filename_validation",
        )

    source_stem = normalize_output_stem(source_filename or DEFAULT_OUTPUT_STEM)
    is_custom = requested_filename is not None
    stem = (
        normalize_output_stem(
            requested_filename,
            strip_any_extension=True,
        )
        if is_custom
        else source_stem
    )

    if target_format == TargetFormat.DOCX:
        if not is_custom and docx_mode == DocxMode.VISUAL:
            stem = f"{stem}-visual"
        suffix = ".docx"
    elif target_format == TargetFormat.TXT:
        suffix = ".txt"
    elif target_format == TargetFormat.HTML:
        suffix = ".html"
    elif len(page_numbers) == 1:
        page_suffix = f"-page-{page_numbers[0]:03d}"
        if not is_custom:
            stem = f"{stem}{page_suffix}"
        suffix = ".jpg" if target_format == TargetFormat.JPEG else ".png"
    else:
        if not is_custom:
            stem = f"{stem}-images"
        suffix = ".zip"

    return f"{_truncate_stem(stem, suffix)}{suffix}"

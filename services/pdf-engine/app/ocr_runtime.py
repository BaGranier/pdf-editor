"""Resource resolution shared by the parent sidecar and its isolated OCR worker."""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path


def bundled_runtime() -> Path | None:
    # Frozen releases never fall back to PATH or a user Tesseract installation.
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "ocr"
    configured = os.environ.get("PDF_ENGINE_OCR_RUNTIME")
    return Path(configured) if configured else None


def validate_runtime(root: Path, languages: list[str] | None = None) -> set[str]:
    try:
        files = json.loads((root / "manifest.json").read_text(encoding="utf-8"))[
            "files"
        ]
        installed = {
            name.removesuffix(".traineddata")
            for name in files
            if name.endswith(".traineddata") and (root / "tessdata" / name).is_file()
        }
        for language in languages or sorted(installed):
            # No arbitrary filesystem paths, even when called outside the HTTP route.
            name = f"{language}.traineddata"
            if not language.isalnum() or name not in files:
                raise ValueError("Unknown OCR language")
            data = (root / "tessdata" / name).read_bytes()
            if hashlib.sha256(data).hexdigest() != files[name]["sha256"]:
                raise ValueError(f"Corrupt OCR language: {language}")
        return installed
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError(
            "Les ressources OCR embarquées sont absentes ou corrompues."
        ) from error

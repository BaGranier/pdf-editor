#!/usr/bin/env python3
"""Validate browser-downloaded conversion artifacts."""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path

import fitz
from docx import Document


def validate_docx(path: Path) -> dict[str, object]:
    if not zipfile.is_zipfile(path):
        raise ValueError("Le DOCX n'est pas une archive ZIP valide.")
    document = Document(path)
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    return {
        "valid": True,
        "text": text,
        "paragraphCount": len(document.paragraphs),
        "imageCount": len(document.inline_shapes),
        "tableCount": len(document.tables),
        "sectionCount": len(document.sections),
        "orientations": [
            "landscape"
            if section.page_width > section.page_height
            else "portrait"
            for section in document.sections
        ],
    }


def validate_txt(path: Path) -> dict[str, object]:
    text = path.read_bytes().decode("utf-8")
    return {
        "valid": True,
        "text": text,
        "pageSeparators": text.count("--- Page "),
    }


def validate_html(path: Path) -> dict[str, object]:
    text = path.read_bytes().decode("utf-8")
    external_resources = re.findall(
        r"""(?:src|href)=["']https?://""",
        text,
        flags=re.IGNORECASE,
    )
    return {
        "valid": text.lower().startswith("<!doctype html>"),
        "text": re.sub("<[^>]+>", " ", text),
        "pageSections": text.count('class="pdf-page"'),
        "externalResourceCount": len(external_resources),
        "embeddedImageCount": text.count("data:image/"),
    }


def image_details(content: bytes) -> dict[str, object]:
    pixmap = fitz.Pixmap(content)
    return {
        "width": pixmap.width,
        "height": pixmap.height,
        "colorspace": pixmap.colorspace.name if pixmap.colorspace else None,
    }


def validate_images(path: Path) -> dict[str, object]:
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            images = [image_details(archive.read(name)) for name in names]
        return {
            "valid": True,
            "archive": True,
            "names": names,
            "images": images,
        }
    return {
        "valid": True,
        "archive": False,
        "names": [path.name],
        "images": [image_details(path.read_bytes())],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument(
        "--format",
        required=True,
        choices=["docx", "txt", "html", "png", "jpeg"],
    )
    args = parser.parse_args()

    if args.format == "docx":
        result = validate_docx(args.artifact)
    elif args.format == "txt":
        result = validate_txt(args.artifact)
    elif args.format == "html":
        result = validate_html(args.artifact)
    else:
        result = validate_images(args.artifact)
    result["size"] = args.artifact.stat().st_size
    print(json.dumps(result))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Validate an exported QA PDF and print machine-readable metadata."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from pypdf import PdfReader


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--expected-pages", type=int)
    args = parser.parse_args()

    reader = PdfReader(args.pdf, strict=True)
    result = {
        "valid": True,
        "pageCount": len(reader.pages),
        "text": "\n".join(page.extract_text() or "" for page in reader.pages),
        "pages": [
            {
                "width": int(page.mediabox.width),
                "height": int(page.mediabox.height),
                "rotation": int(page.rotation),
            }
            for page in reader.pages
        ],
    }
    if args.expected_pages is not None and result["pageCount"] != args.expected_pages:
        raise SystemExit(
            f"Nombre de pages inattendu: {result['pageCount']} != {args.expected_pages}"
        )
    print(json.dumps(result))


if __name__ == "__main__":
    main()

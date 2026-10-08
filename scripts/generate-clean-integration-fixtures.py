"""Large QA assets are generated under ignored output, never committed."""

from __future__ import annotations

import json
import random
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/output/windows-qa-004/fixtures"


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for label, axis in [("2m", 850), ("5m", 1350), ("10m", 1900)]:
        pix = fitz.Pixmap(
            fitz.csRGB, axis, axis, random.Random(4).randbytes(axis * axis * 3), False
        )
        for format_ in ("png", "jpeg"):
            target = OUTPUT / f"image-{label}.{format_}"
            target.write_bytes(pix.tobytes(format_))
            sizes[target.name] = target.stat().st_size
    with (
        fitz.open(ROOT / "apps/web/e2e/fixtures/conversion-scan.pdf") as source,
        fitz.open() as doc,
    ):
        for index in range(5):
            doc.insert_pdf(source)
            if index == 4:
                doc[index].set_rotation(90)
        doc.save(OUTPUT / "scan-multipage-rotated.pdf")
    with (
        fitz.open(ROOT / "apps/web/e2e/fixtures/conversion-scan.pdf") as source,
        fitz.open() as doc,
    ):
        for _ in range(50):
            doc.insert_pdf(source)
        doc.save(OUTPUT / "scan-interrupt-50.pdf", garbage=2)
    (OUTPUT / "manifest.json").write_text(json.dumps(sizes, indent=2), encoding="utf-8")
    print(json.dumps(sizes))


if __name__ == "__main__":
    main()

"""Large QA assets are generated under ignored output, never committed."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/output/windows-qa-004/fixtures"


def main(output: Path = OUTPUT, source_scan: Path | None = None) -> None:
    source_scan = source_scan or ROOT / "apps/web/e2e/fixtures/conversion-scan.pdf"
    output.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for label, axis in [("2m", 850), ("5m", 1350), ("10m", 1900)]:
        pix = fitz.Pixmap(
            fitz.csRGB, axis, axis, random.Random(4).randbytes(axis * axis * 3), False
        )
        for format_ in ("png", "jpeg"):
            target = output / f"image-{label}.{format_}"
            target.write_bytes(pix.tobytes(format_))
            sizes[target.name] = target.stat().st_size
    with (
        fitz.open(source_scan) as source,
        fitz.open() as doc,
    ):
        for index in range(5):
            doc.insert_pdf(source)
            if index == 4:
                doc[index].set_rotation(90)
        doc.save(output / "scan-multipage-rotated.pdf")
    with (
        fitz.open(source_scan) as source,
        fitz.open() as doc,
    ):
        for _ in range(50):
            doc.insert_pdf(source)
        doc.save(output / "scan-interrupt-50.pdf", garbage=2)
    (output / "manifest.json").write_text(json.dumps(sizes, indent=2), encoding="utf-8")
    print(json.dumps(sizes))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=OUTPUT)
    parser.add_argument("--source-scan", type=Path)
    args = parser.parse_args()
    main(args.output_dir, args.source_scan)

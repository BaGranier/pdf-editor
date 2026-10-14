"""Compare compression on five synthetic content classes with structural/raster checks."""

from __future__ import annotations
import importlib
import json
import math
import random
import sys
import time
from pathlib import Path

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/pdf-engine"))
from app.export_options import ExportOptions, finalize_export  # noqa: E402

fixtures = importlib.import_module("scripts.editor-robustness-fixtures")
OUTPUT = fixtures.OUTPUT / "compression"


def sources():
    # A textured gradient approximates photographic tonal content; it is not a real photo.
    w, h = 1200, 900
    noise = random.Random(808).randbytes(w * h)
    samples = bytearray(w * h * 3)
    for y in range(h):
        for x in range(w):
            n = noise[y * w + x] // 12
            offset = (y * w + x) * 3
            samples[offset : offset + 3] = bytes(
                (
                    min(255, 60 + x * 140 // w + n),
                    min(255, 40 + y * 130 // h + n),
                    min(255, 80 + int(45 * math.sin(x / 130)) + n),
                )
            )
    photo = fitz.Pixmap(fitz.csRGB, w, h, bytes(samples), False).tobytes("jpeg")
    alpha = fitz.Pixmap(
        fitz.csRGB, 900, 600, bytes([128, 0, 0, 128]) * 900 * 600, True
    ).tobytes("png")
    for kind in ["photo", "scan", "text", "vectors", "transparency"]:
        with fitz.open() as document:
            page = document.new_page(width=400, height=400)
            page.insert_text((20, 30), "SELECTABLE café été WITNESS", fontsize=14)
            if kind in ["photo", "transparency"]:
                page.insert_image(
                    fitz.Rect(30, 60, 230, 200),
                    stream=photo if kind == "photo" else alpha,
                )
            if kind == "scan":
                with fitz.open() as scan:
                    scan.new_page(width=400, height=400).insert_text(
                        (30, 120), "SCANNED TEXT WITNESS", fontsize=22
                    )
                    page.insert_image(
                        fitz.Rect(0, 60, 400, 400),
                        stream=scan[0].get_pixmap(dpi=250).tobytes("png"),
                    )
            if kind == "vectors":
                page.draw_rect(
                    fitz.Rect(30, 60, 230, 200),
                    color=(0, 0, 1),
                    fill=(0, 1, 0),
                    fill_opacity=0.5,
                )
                page.draw_circle((300, 250), 40, color=(1, 0, 0))
            yield kind, document.tobytes()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    results = []
    for kind, source in sources():
        baseline = None
        for quality in ["maximum", "balanced", "small"]:
            started = time.perf_counter()
            output = finalize_export(source, ExportOptions(quality=quality))
            destination = OUTPUT / f"{kind}-{quality}.pdf"
            destination.write_bytes(output)
            with fitz.open(stream=output) as pdf:
                page = pdf[0]
                text = page.get_text()
                drawings = page.get_drawings()
                images = page.get_images()
                assert "SELECTABLE café été WITNESS" in text
                assert len(drawings) == (2 if kind == "vectors" else 0)
                if kind == "transparency":
                    assert images[0][1] > 0
                    assert (
                        page.get_pixmap().pixel(100, 100) == (255, 126, 126)
                        or max(
                            abs(a - b)
                            for a, b in zip(
                                page.get_pixmap().pixel(100, 100), (255, 127, 127)
                            )
                        )
                        <= 5
                    )
                pix = page.get_pixmap()
                sampled = [
                    pix.pixel(x, y)[:3]
                    for y in range(70, 195, 8)
                    for x in range(40, 225, 8)
                ]
                if baseline is None:
                    baseline = sampled
                difference = sum(
                    abs(a - b) for p, q in zip(sampled, baseline) for a, b in zip(p, q)
                ) / (len(sampled) * 3)
                pix.save(OUTPUT / f"{kind}-{quality}.png")
            reader = PdfReader(destination, strict=True)
            assert (
                len(reader.pages) == 1 and "WITNESS" in reader.pages[0].extract_text()
            )
            results.append(
                dict(
                    corpus=kind,
                    quality=quality,
                    sourceBytes=len(source),
                    outputBytes=len(output),
                    durationMs=round((time.perf_counter() - started) * 1000, 2),
                    textSelectable=True,
                    vectors=len(drawings),
                    images=len(images),
                    sampleMeanChannelDelta=round(difference, 3),
                )
            )
    (OUTPUT / "metrics.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()

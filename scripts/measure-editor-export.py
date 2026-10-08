#!/usr/bin/env python3
"""Reproducible WSL export measurements; outputs only synthetic local artifacts."""

from __future__ import annotations

import base64
import json
import random
import resource
import sys
import time
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/pdf-engine"))
from app.main import OrganizeExportPlan, export_organized_pdf  # noqa: E402


def main() -> None:
    output_dir = ROOT / "data/output/editor-export-003"
    output_dir.mkdir(parents=True, exist_ok=True)
    samples = random.Random(41).randbytes(1200 * 1200 * 3)
    pix = fitz.Pixmap(fitz.csRGB, 1200, 1200, samples, False)
    image = pix.tobytes("png")
    results: list[dict[str, object]] = []
    for fixture in ("text-vector", "image-heavy", "mixed", "added-edits"):
        with fitz.open() as document:
            page = document.new_page(width=400, height=400)
            if fixture != "image-heavy":
                page.insert_text((20, 30), "SELECTABLE VECTOR WITNESS")
                page.draw_rect(fitz.Rect(20, 50, 180, 80), color=(1, 0, 0))
            if fixture in {"image-heavy", "mixed"}:
                page.insert_image(fitz.Rect(20, 100, 220, 300), stream=image)
            source = document.tobytes()
        (output_dir / f"{fixture}-source.pdf").write_bytes(source)
        for quality in ("maximum", "balanced", "small"):
            payload: dict[str, object] = {
                "schemaVersion": 2,
                "pages": [{"sourcePageIndex": 0}],
                "exportOptions": {"quality": quality},
            }
            if fixture == "added-edits":
                payload.update(
                    {
                        "images": [
                            {
                                "id": f"image-{n}",
                                "type": "image",
                                "page": 1,
                                "imageId": "shared-asset",
                                "order": n,
                                "rect": {
                                    "x0": 20 + n,
                                    "y0": 40 + n,
                                    "x1": 220 + n,
                                    "y1": 240 + n,
                                },
                            }
                            for n in range(10)
                        ],
                        "signatureImages": [
                            {
                                "id": "shared-asset",
                                "mimeType": "image/png",
                                "width": 1200,
                                "height": 1200,
                                "dataUrl": "data:image/png;base64,"
                                + base64.b64encode(image).decode(),
                            }
                        ],
                    }
                )
            started = time.perf_counter()
            output = export_organized_pdf(
                {"source": source}, OrganizeExportPlan.model_validate(payload)
            )
            elapsed = (time.perf_counter() - started) * 1000
            (output_dir / f"{fixture}-{quality}.pdf").write_bytes(output)
            with fitz.open(stream=output) as validation:
                assert validation.page_count == 1
                assert (
                    fixture == "image-heavy"
                    or "SELECTABLE VECTOR WITNESS" in validation[0].get_text()
                )
                max_image_width = max(
                    (item[2] for item in validation[0].get_images()), default=0
                )
            results.append(
                {
                    "fixture": fixture,
                    "quality": quality,
                    "sourceBytes": len(source),
                    "outputBytes": len(output),
                    "durationMs": round(elapsed, 2),
                    "maxImageWidth": max_image_width,
                }
            )
    report = {
        "scope": "Linux/WSL process, synthetic sources only; RSS is process high-water mark",
        "python": sys.version.split()[0],
        "pymupdf": fitz.VersionBind,
        "peakRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "results": results,
    }
    (output_dir / "measurements.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

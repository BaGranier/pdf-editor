"""Synthetic incompressible images for native Save qualification; no user inputs."""
from __future__ import annotations

import json
from pathlib import Path
import random

import fitz


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "data/output/mvp-001"
    root.mkdir(parents=True, exist_ok=True)
    manifest = []
    for side in [1200, 2300, 2950, 3000]:
        target = root / f"large-{side}.pdf"
        if not target.exists():
            samples = random.Random(side).randbytes(side * side * 3)
            pixmap = fitz.Pixmap(fitz.csRGB, side, side, samples, False)
            with fitz.open() as document:
                page = document.new_page()
                page.insert_text((30, 30), "MVP SYNTHETIC LARGE SAVE")
                page.insert_image(fitz.Rect(30, 50, 560, 780), pixmap=pixmap)
                document.save(target, deflate=True)
        with fitz.open(target) as document:
            if len(document) != 1 or "MVP SYNTHETIC LARGE SAVE" not in document[0].get_text():
                raise ValueError(f"Invalid synthetic Save fixture: {target.name}")
        manifest.append({"file": f"data/output/mvp-001/{target.name}", "bytes": target.stat().st_size})
    (root / "large-fixtures.json").write_text(json.dumps(manifest, indent=2), "utf-8")


if __name__ == "__main__":
    main()

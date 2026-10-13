"""Linux process-isolated wall/CPU/RSS measurements on the synthetic OCR corpus."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/output/protection-ocr-007"


def measure(name: str, correction: int) -> dict[str, object]:
    sys.path.insert(0, str(ROOT / "services/pdf-engine"))
    import fitz
    from app.ocr_orientation import rotate_scan
    from app.ocr_worker import run_worker

    source = ROOT / f"apps/web/e2e/fixtures/ocr-oriented-{name}.pdf"
    destination = OUTPUT / f"{name}-{correction}.pdf"
    oriented = OUTPUT / f"{name}-{correction}-oriented.pdf"
    runtime = ROOT / "services/pdf-engine/build/ocr"
    wall, cpu = time.perf_counter(), time.process_time()
    if correction:
        rotate_scan(source, oriented, correction)
    run_worker(
        oriented if correction else source, destination, runtime, "fra+eng", "force-ocr"
    )
    result: dict[str, object] = {
        "case": name,
        "correction": correction,
        "wall_seconds": round(time.perf_counter() - wall, 3),
        "cpu_seconds": round(time.process_time() - cpu, 3),
        "bytes": destination.stat().st_size,
    }
    if sys.platform.startswith("linux"):
        import resource

        result["peak_rss_bytes"] = (
            resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
        )
    with fitz.open(destination) as document:
        text = " ".join(" ".join(page.get_text().split()) for page in document)
        result["pages"] = len(document)
        result["witness"] = "ORIENTATION WITNESS" in text
        result["accents"] = {
            word: word in text
            for word in ["français", "été", "déjà", "élève", "école", "café"]
        }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case")
    parser.add_argument("--correction", type=int, choices=(0, 90, 180, 270), default=0)
    options = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if options.case:
        if options.case not in {
            "0",
            "90",
            "180",
            "270",
            "skew-positive",
            "skew-negative",
            "contrast",
            "multipage",
        }:
            parser.error("Unknown synthetic case")
        print(json.dumps(measure(options.case, options.correction)))
        return
    results = []
    for name, correction in [
        ("0", 0),
        ("90", 0),
        ("90", 270),
        ("180", 0),
        ("180", 180),
        ("270", 0),
        ("270", 90),
        ("skew-positive", 0),
        ("skew-negative", 0),
        ("contrast", 0),
        ("multipage", 0),
    ]:
        process = subprocess.run(
            [
                sys.executable,
                "-m",
                "scripts.measure-ocr-orientation",
                "--case",
                name,
                "--correction",
                str(correction),
            ],
            cwd=ROOT,
            env={**os.environ, "PATH": ""},
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
        )
        results.append(json.loads(process.stdout))
    (OUTPUT / "metrics.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()

"""Bounded Linux backend profiles: comparable cycles, not a universal leak threshold."""

from __future__ import annotations

import argparse
import base64
import gc
import importlib
import json
import os
import resource
import sys
import time
import tracemalloc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services/pdf-engine"))
from app.main import OrganizeExportPlan, export_organized_pdf  # noqa: E402
import fitz  # noqa: E402

fixtures = importlib.import_module("scripts.editor-robustness-fixtures")
OUTPUT = fixtures.OUTPUT


def metrics():
    status = Path("/proc/self/status").read_text()
    rss = (
        int(
            next(
                line.split()[1]
                for line in status.splitlines()
                if line.startswith("VmRSS:")
            )
        )
        * 1024
    )
    return dict(
        rssBytes=rss,
        peakRssBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024,
        descriptors=len(os.listdir("/proc/self/fd")),
        cpuSeconds=round(time.process_time(), 3),
        mupdfStoreBytes=fitz.TOOLS.store_size(),
        pythonBytes=tracemalloc.get_traced_memory()[0],
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cycles", type=int, choices=range(3, 9), default=6)
    parser.add_argument(
        "--diagnose-native",
        action="store_true",
        help="Diagnostic only: empty MuPDF store and ask libc to trim free arenas",
    )
    parser.add_argument("--quality", choices=["maximum", "balanced", "small"])
    parser.add_argument("--no-render", action="store_true")
    parser.add_argument(
        "--native-rewrite-only",
        action="store_true",
        help="Isolate upstream PyMuPDF rewriting without the application exporter",
    )
    options = parser.parse_args()
    tracemalloc.start()
    if not (OUTPUT / "manifest.json").exists():
        fixtures.generate()
    manifest = json.loads((OUTPUT / "manifest.json").read_text())
    records = []
    source, scene, scene_assets = fixtures.scene()
    if options.native_rewrite_only:
        with fitz.open() as original:
            page = original.new_page(width=400, height=400)
            page.insert_image(
                fitz.Rect(20, 20, 150, 150),
                stream=(OUTPUT / manifest["assets"][0]["fileName"]).read_bytes(),
            )
            source = original.tobytes()
        for cycle in range(options.cycles):
            with fitz.open(stream=source) as document:
                document.rewrite_images(dpi_threshold=225, dpi_target=180, quality=85)
                document.tobytes()
            gc.collect()
            fitz.TOOLS.store_shrink(100)
            import ctypes

            ctypes.CDLL(None).malloc_trim(0)
            records.append(dict(cycle=cycle, after=metrics()))
        (OUTPUT / "native-rewrite-only.json").write_text(json.dumps(records, indent=2))
        print(json.dumps(records, indent=2))
        return
    for cycle in range(options.cycles):
        before = metrics()
        assets = [
            dict(
                id=f"asset-{i}",
                mimeType=a["mimeType"],
                width=a["width"],
                height=a["height"],
                dataUrl=f"data:{a['mimeType']};base64,"
                + base64.b64encode((OUTPUT / a["fileName"]).read_bytes()).decode(),
            )
            for i, a in enumerate(manifest["assets"])
        ]
        edits = [
            dict(
                id=f"image-{i}",
                type="image",
                page=1,
                imageId=f"asset-{i%20}",
                rect=fixtures.rect(20 + i, 80 + i, 130, 110),
            )
            for i in range(30)
        ]
        outputs = []
        for quality in (
            [options.quality] if options.quality else ["maximum", "balanced", "small"]
        ):
            payload = OrganizeExportPlan.model_validate(
                fixtures.plan(edits, assets, quality)
            )
            started = time.perf_counter()
            cpu = time.process_time()
            output = export_organized_pdf({"source": source}, payload)
            destination = OUTPUT / f"backend-{cycle}-{quality}.pdf"
            destination.write_bytes(output)
            with fitz.open(stream=output) as pdf:
                assert len(pdf) == 1 and "SOURCE SELECTABLE" in pdf[0].get_text()
                assert len(pdf[0].get_image_info()) == 30
                if not options.no_render:
                    pdf[
                        0
                    ].get_pixmap()  # Exercise reopen/render and release it each cycle.
            outputs.append(
                dict(
                    quality=quality,
                    bytes=len(output),
                    wallSeconds=round(time.perf_counter() - started, 3),
                    cpuSeconds=round(time.process_time() - cpu, 3),
                )
            )
            del output, payload
        del assets, edits
        gc.collect()
        record = dict(cycle=cycle, before=before, after=metrics(), exports=outputs)
        if options.diagnose_native:
            import ctypes

            fitz.TOOLS.store_shrink(100)
            record["afterEmptyStore"] = metrics()
            ctypes.CDLL(None).malloc_trim(0)
            record["afterLibcTrim"] = metrics()
        records.append(record)
    (
        OUTPUT
        / (
            f"backend-native-diagnostic-{options.quality or 'all'}{'-no-render' if options.no_render else ''}.json"
            if options.diagnose_native
            else "backend-cycles.json"
        )
    ).write_text(json.dumps(records, indent=2))
    print(json.dumps(records, indent=2))


if __name__ == "__main__":
    main()

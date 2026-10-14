"""Synthetic composition and bounded asset corpus for Linux/browser QA."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import random
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/output/editor-robustness-008"


def rect(x: float, y: float, w: float, h: float) -> dict[str, float]:
    return dict(x0=x, y0=y, x1=x + w, y1=y + h)


def scene() -> tuple[bytes, list[dict], list[dict]]:
    with fitz.open() as document:
        page = document.new_page(width=400, height=400)
        page.insert_text((20, 30), "SOURCE SELECTABLE : cafe et ete", fontsize=12)
        page.insert_text((45, 185), "SOURCE UNDER OVERLAYS", fontsize=12)
        widget = fitz.Widget()
        widget.field_name = "synthetic-name"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.field_value = "Form witness"
        widget.rect = fitz.Rect(30, 350, 220, 375)
        page.add_widget(widget)
        source = document.tobytes()
    assets = []
    for name, rgb in [("blue", (0, 0, 255)), ("green", (0, 180, 0))]:
        pix = fitz.Pixmap(fitz.csRGB, 240, 120, bytes(rgb) * 240 * 120, False)
        binary = pix.tobytes("png")
        assets.append(
            dict(
                id=name,
                width=240,
                height=120,
                mimeType="image/png",
                dataUrl="data:image/png;base64," + base64.b64encode(binary).decode(),
            )
        )
    area = rect(45, 130, 260, 150)

    def shape(name, box, kind="rectangle", fill="#ff0000", opacity=1, **extra):
        return dict(
            id=name,
            type="shape",
            shapeType=kind,
            page=1,
            rect=box,
            style=dict(
                strokeColor=fill or "#000000",
                strokeWidth=2,
                fillColor=fill,
                opacity=opacity,
            ),
            **extra,
        )

    edits = [
        dict(
            id="highlight",
            type="text_markup",
            kind="highlight",
            page=1,
            rect=area,
            rects=[area],
            color="#ffff00",
        ),
        dict(
            id="ink",
            type="freehand",
            page=1,
            rect=area,
            points=[dict(x=50, y=160), dict(x=290, y=160), dict(x=230, y=240)],
            style=dict(color="#7c00ff", strokeWidth=10, opacity=1),
        ),
        dict(
            id="image",
            type="image",
            page=1,
            rect=rect(70, 130, 170, 110),
            imageId="blue",
        ),
        dict(
            id="cropped",
            type="image",
            page=1,
            rect=rect(220, 200, 80, 65),
            imageId="green",
            crop=dict(x=0.5, y=0, width=0.5, height=1),
        ),
        shape("opaque", rect(50, 210, 80, 60), fill="#000000"),
        shape("alpha", rect(150, 140, 120, 90), opacity=0.5),
        shape("ellipse", rect(110, 245, 80, 55), "ellipse", "#00c8c8"),
        shape(
            "line",
            rect(50, 175, 250, 2),
            "line",
            None,
            start=dict(x=50, y=176),
            end=dict(x=300, y=176),
        ),
        shape(
            "arrow",
            rect(80, 155, 200, 2),
            "line",
            "#ff8000",
            lineStyle="arrow",
            start=dict(x=80, y=156),
            end=dict(x=280, y=156),
        ),
        dict(
            id="note",
            type="comment",
            page=1,
            rect=rect(270, 135, 20, 20),
            source="local",
            commentType="text",
            content="GLOBAL COMMENT WITNESS",
            author="Synthetic QA",
        ),
        dict(
            id="signature",
            type="signature",
            page=1,
            rect=rect(300, 180, 65, 30),
            imageId="green",
        ),
        dict(
            id="underline",
            type="text_markup",
            kind="underline",
            page=1,
            rect=rect(35, 320, 200, 15),
            rects=[rect(35, 320, 200, 15)],
            color="#008000",
        ),
        dict(
            id="added",
            type="add_text",
            page=1,
            rect=rect(35, 290, 240, 25),
            text="ADDED EDITABLE WITNESS",
            style=dict(
                fontFamily="Helvetica", fontSize=12, color="#000000", bold=False
            ),
        ),
    ]
    return source, edits, assets


def generate(output: Path = OUTPUT) -> None:
    output.mkdir(parents=True, exist_ok=True)
    source, edits, scene_assets = scene()
    (output / "scene.pdf").write_bytes(source)
    (output / "scene.json").write_text(
        json.dumps(dict(edits=edits, assets=scene_assets)), encoding="utf-8"
    )
    assets = []
    for index in range(20):
        w, h = (1600, 1280) if index < 2 else (512, 384)
        alpha = index == 2
        channels = 4 if alpha else 3
        samples = bytearray(random.Random(800 + index).randbytes(w * h * channels))
        if alpha:
            for offset in range(0, len(samples), 4):
                samples[offset : offset + 4] = bytes(
                    [
                        samples[offset] // 2,
                        samples[offset + 1] // 2,
                        samples[offset + 2] // 2,
                        128,
                    ]
                )
        pix = fitz.Pixmap(fitz.csRGB, w, h, bytes(samples), alpha)
        extension = "png" if index % 2 == 0 else "jpeg"
        binary = pix.tobytes(extension)
        name = f"asset-{index:02}.{extension}"
        (output / name).write_bytes(binary)
        assets.append(
            dict(
                fileName=name,
                sha256=hashlib.sha256(binary).hexdigest(),
                bytes=len(binary),
                width=w,
                height=h,
                mimeType="image/png" if extension == "png" else "image/jpeg",
            )
        )
    manifest = dict(
        schemaVersion=1,
        assets=assets,
        totalBytes=sum(a["bytes"] for a in assets),
        probes=[
            [x, y]
            for y in [145, 155, 185, 220, 235, 260]
            for x in [60, 100, 140, 180, 210, 250, 285]
        ],
    )
    (output / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(dict(assets=len(assets), bytes=manifest["totalBytes"])))


def plan(edits: list[dict], assets: list[dict], quality="maximum") -> dict:
    groups = dict(
        add_text="edits",
        image="images",
        signature="signatures",
        shape="shapes",
        freehand="freehands",
        text_markup="textMarkups",
        comment="comments",
    )
    result = dict(
        schemaVersion=2,
        pages=[dict(sourcePageIndex=0)],
        signatureImages=assets,
        exportOptions=dict(quality=quality),
    )
    for order, edit in enumerate(edits):
        result.setdefault(groups[edit["type"]], []).append(dict(edit, order=order))
    return result


def compare(pdf: Path, viewer: Path) -> None:
    screenshot = fitz.Pixmap(viewer)
    manifest = json.loads((OUTPUT / "manifest.json").read_text())
    with fitz.open(pdf) as document:
        page = document[0]
        rendered = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        differences = []
        for x, y in manifest["probes"]:
            view = screenshot.pixel(
                round(x / 400 * screenshot.width),
                round((400 - y) / 400 * screenshot.height),
            )[:3]
            final = rendered.pixel(round(x * 2), round((400 - y) * 2))[:3]
            error = max(abs(a - b) for a, b in zip(view, final))
            if error > 18:
                differences.append(
                    dict(point=[x, y], viewer=view, pdf=final, error=error)
                )
        assert not differences, json.dumps(differences)
        assert "SOURCE SELECTABLE" in page.get_text()
        assert "ADDED EDITABLE WITNESS" in page.get_text()
        notes = list(page.annots() or [])
        assert len(notes) == 1 and notes[0].info["content"] == "GLOBAL COMMENT WITNESS"
        assert notes[0].flags & fitz.PDF_ANNOT_IS_HIDDEN
        assert list(page.widgets())
        assert len(page.get_drawings()) >= 9
    print(
        json.dumps(
            dict(
                probes=len(manifest["probes"]),
                maxAllowedChannelError=18,
                textSelectable=True,
                annotations=1,
                forms=1,
            )
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare", nargs=2, metavar=("PDF", "VIEWER_PNG"), type=Path)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT)
    options = parser.parse_args()
    if options.compare:
        compare(*options.compare)
    else:
        generate(options.output_dir)

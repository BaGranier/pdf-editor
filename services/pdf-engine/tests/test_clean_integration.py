from __future__ import annotations

import asyncio
import base64
import json
import io
import random
import struct

import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app import main
from test_editor_export_profiles import export, image_asset, source_pdf

RECT = {"x0": 50, "y0": 100, "x1": 250, "y1": 200}


@pytest.mark.parametrize(
    "opacity,order,expected",
    [(1, 1, (0, 0, 255)), (0.5, 1, (127, 127, 214)), (1, 0, (81, 81, 173))],
)
def test_markup_participates_in_global_vector_order(
    opacity: float, order: int, expected: tuple[int, int, int]
) -> None:
    output = export(
        source_pdf(),
        textMarkups=[
            {
                "id": "highlight",
                "type": "text_markup",
                "page": 1,
                "rect": RECT,
                "rects": [RECT],
                "kind": "highlight",
                "color": "#ffff00",
                "order": 1 - order,
            }
        ],
        shapes=[
            {
                "id": "cover",
                "type": "shape",
                "page": 1,
                "rect": RECT,
                "shapeType": "rectangle",
                "order": order,
                "style": {
                    "strokeColor": "#0000ff",
                    "fillColor": "#0000ff",
                    "strokeWidth": 1,
                    "opacity": opacity,
                },
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        assert doc[0].get_pixmap().pixel(100, 250) == pytest.approx(expected, abs=4)
        assert "Selectable vector text" in doc[0].get_text()
        assert len(doc[0].get_drawings()) == 2
        assert not list(doc[0].annots() or [])


@pytest.mark.parametrize("kind", ["image", "ellipse", "circle", "arrow", "freehand"])
def test_mixed_objects_cover_markup_in_model_order(kind: str) -> None:
    pixels = []
    for above in (False, True):
        common = {"id": "mixed", "page": 1, "rect": RECT, "order": int(above)}
        if kind == "image":
            objects = {
                "signatureImages": [image_asset()],
                "images": [{**common, "type": "image", "imageId": "asset"}],
            }
        elif kind == "freehand":
            objects = {
                "freehands": [
                    {
                        **common,
                        "type": "freehand",
                        "points": [{"x": 50, "y": 150}, {"x": 250, "y": 150}],
                        "style": {"color": "#0000ff", "strokeWidth": 20},
                    }
                ]
            }
        else:
            geometry = {"shapeType": kind}
            if kind == "circle":
                common["rect"] = {"x0": 100, "y0": 100, "x1": 200, "y1": 200}
            if kind == "arrow":
                geometry = {
                    "shapeType": "line",
                    "lineStyle": "arrow",
                    "start": {"x": 50, "y": 150},
                    "end": {"x": 250, "y": 150},
                }
            objects = {
                "shapes": [
                    {
                        **common,
                        **geometry,
                        "type": "shape",
                        "style": {
                            "strokeColor": "#0000ff",
                            "fillColor": "#0000ff",
                            "strokeWidth": 20,
                        },
                    }
                ]
            }
        output = export(
            source_pdf(),
            textMarkups=[
                {
                    "id": "highlight",
                    "type": "text_markup",
                    "page": 1,
                    "rect": RECT,
                    "rects": [RECT],
                    "kind": "highlight",
                    "color": "#ffff00",
                    "order": int(not above),
                }
            ],
            **objects,
        )
        with fitz.open(stream=output) as doc:
            pixels.append(doc[0].get_pixmap().pixel(150, 250))
            assert "Selectable vector text" in doc[0].get_text()
            assert (
                doc[0].get_images()
                if kind == "image"
                else len(doc[0].get_drawings()) >= 2
            )
    assert pixels[0] != pixels[1]
    assert pixels[1] == ((255, 0, 0) if kind == "image" else (0, 0, 255))


@pytest.mark.parametrize("kind", ["png", "jpeg"])
def test_crop_embeds_only_retained_pixels_and_free_resize(kind: str) -> None:
    asset = image_asset(kind)
    output = export(
        source_pdf(),
        signatureImages=[asset],
        images=[
            {
                "id": "cropped",
                "type": "image",
                "imageId": "asset",
                "page": 1,
                "rect": RECT,
                "crop": {"x": 0.5, "y": 0, "width": 0.5, "height": 1},
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        image = doc[0].get_images()[0]
        assert (image[2], image[3]) == (30, 30)
        assert tuple(doc[0].get_image_rects(image[0])[0]) == pytest.approx(
            (50, 200, 250, 300)
        )
        assert doc[0].get_pixmap().pixel(100, 250) == pytest.approx((255, 0, 0), abs=3)
        assert "Selectable vector text" in doc[0].get_text()


@pytest.mark.parametrize(
    "crop",
    [
        {"x": -0.1, "y": 0, "width": 1, "height": 1},
        {"x": 0.8, "y": 0, "width": 0.4, "height": 1},
        {"x": 0, "y": 0, "width": 0, "height": 1},
    ],
)
def test_invalid_crop_rejected(crop: dict[str, float]) -> None:
    with pytest.raises(ValidationError):
        main.ImageCrop.model_validate(crop)


def test_crop_preserves_png_alpha_mask() -> None:
    pixmap = fitz.Pixmap(fitz.csRGB, 20, 10, bytes([128, 0, 0, 128]) * 200, True)
    asset = {
        "id": "alpha",
        "mimeType": "image/png",
        "width": 20,
        "height": 10,
        "dataUrl": "data:image/png;base64,"
        + base64.b64encode(pixmap.tobytes("png")).decode(),
    }
    output = export(
        source_pdf(),
        signatureImages=[asset],
        images=[
            {
                "id": "crop-alpha",
                "type": "image",
                "page": 1,
                "rect": RECT,
                "imageId": "alpha",
                "crop": {"x": 0.5, "y": 0, "width": 0.5, "height": 1},
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        image = doc[0].get_images()[0]
        assert image[1] > 0
        assert (image[2], image[3]) == (10, 10)
        assert doc[0].get_pixmap().pixel(100, 250) == pytest.approx(
            (255, 127, 127), abs=2
        )


def test_absurd_dimensions_rejected_before_decode() -> None:
    binary = (
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\x0dIHDR"
        + struct.pack(">II", 20000, 20000)
    )
    image = main.SignatureImagePayload(
        id="bomb", mimeType="image/png", width=20000, height=20000
    )
    with pytest.raises(HTTPException, match="422"):
        main._decode_signature_image(image, binary)


def test_comment_metadata_does_not_repaint_above_exported_content() -> None:
    output = export(
        source_pdf(),
        comments=[
            {
                "id": "note",
                "type": "comment",
                "page": 1,
                "rect": RECT,
                "content": "Preserved metadata",
                "order": 0,
            }
        ],
        shapes=[
            {
                "id": "cover",
                "type": "shape",
                "page": 1,
                "rect": RECT,
                "shapeType": "rectangle",
                "order": 1,
                "style": {
                    "strokeColor": "#ffffff",
                    "fillColor": "#ffffff",
                    "strokeWidth": 1,
                },
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        page = doc[0]
        note = page.first_annot
        assert note.info["content"] == "Preserved metadata"
        assert note.flags & fitz.PDF_ANNOT_IS_HIDDEN
        assert doc[0].get_pixmap().pixel(150, 250) == (255, 255, 255)
    response = asyncio.run(
        main.extract_pdf_annotations(
            main.UploadFile(filename="export.pdf", file=io.BytesIO(output))
        )
    )
    assert response["annotations"][0].appearance_hidden


@pytest.mark.parametrize("pixels", [700, 850, 1350, 1900])
def test_http_binary_images_cross_form_field_limit(pixels: int) -> None:
    # ~1.4, 2.1, 5.4, 10.8 MB PNGs, generated deterministically in memory.
    pix = fitz.Pixmap(
        fitz.csRGB,
        pixels,
        pixels,
        random.Random(4).randbytes(pixels * pixels * 3),
        False,
    )
    binary = pix.tobytes("png")
    asset = {"id": "asset", "mimeType": "image/png", "width": pixels, "height": pixels}
    plan = {
        "pages": [{"sourcePageIndex": 0}],
        "signatureImages": [asset],
        "images": [
            {
                "id": "image",
                "type": "image",
                "page": 1,
                "rect": RECT,
                "imageId": "asset",
            }
        ],
    }
    boundary = b"clean-integration-004"

    def part(
        name: str,
        data: bytes,
        filename: str | None = None,
        mime: str = "application/octet-stream",
    ) -> bytes:
        header = f'Content-Disposition: form-data; name="{name}"' + (
            f'; filename="{filename}"' if filename else ""
        )
        return (
            b"--"
            + boundary
            + b"\r\n"
            + header.encode()
            + b"\r\n"
            + (f"Content-Type: {mime}\r\n".encode() if filename else b"")
            + b"\r\n"
            + data
            + b"\r\n"
        )

    body = (
        part("plan", json.dumps(plan).encode())
        + part("imageIds", b'["asset"]')
        + part("files", source_pdf(), "source.pdf", "application/pdf")
        + part("imageFiles", binary, "asset", "image/png")
        + b"--"
        + boundary
        + b"--\r\n"
    )
    messages = []

    async def call() -> None:
        sent = False

        async def receive() -> dict:
            nonlocal sent
            if sent:
                return {"type": "http.disconnect"}
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}

        async def send(message: dict) -> None:
            messages.append(message)

        await main.app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/pdf/export/organize",
                "query_string": b"",
                "headers": [
                    (b"content-type", b"multipart/form-data; boundary=" + boundary)
                ],
                "server": ("test", 80),
                "client": ("test", 1),
            },
            receive,
            send,
        )

    asyncio.run(call())
    assert messages[0]["status"] == 200, messages
    with fitz.open(
        stream=b"".join(message.get("body", b"") for message in messages)
    ) as doc:
        assert doc[0].get_images()[0][2:4] == (pixels, pixels)
        assert "Selectable vector text" in doc[0].get_text()


def test_legacy_data_url_still_exports() -> None:
    asset = image_asset()
    assert len(base64.b64decode(str(asset["dataUrl"]).split(",")[1])) > 0
    output = export(
        source_pdf(),
        signatureImages=[asset],
        images=[
            {
                "id": "legacy",
                "type": "image",
                "imageId": "asset",
                "page": 1,
                "rect": RECT,
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        assert doc[0].get_images()[0][2:4] == (60, 30)

"""Bounded raster import. JPEG stays encoded; alpha PNG uses an explicit PDF mask."""

from __future__ import annotations

import zlib
from typing import Annotated, Literal

import fitz
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, ValidationError, model_validator

from app.image_dimensions import raster_dimensions

router = APIRouter()
MAX_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 192 * 1024 * 1024
MAX_TOTAL_PIXELS = 128_000_000


class ImageTransform(BaseModel):
    type: Literal["crop", "rotate", "mirror_horizontal", "mirror_vertical"]
    x: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)
    y: float = Field(default=0, ge=0, le=1, allow_inf_nan=False)
    width: float = Field(default=1, ge=0.01, le=1, allow_inf_nan=False)
    height: float = Field(default=1, ge=0.01, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def check_crop(self) -> "ImageTransform":
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("Recadrage hors image.")
        return self


def transform_background(data: bytes, transforms: list[ImageTransform]) -> bytes:
    """Transform the background within a fixed documentary coordinate space."""
    with fitz.open(stream=data) as initial:
        fixed = initial[0].rect
    for transform in transforms:
        if transform.type == "crop":
            data = frame_background(data, fixed)
        with fitz.open(stream=data) as source, fitz.open() as cropped:
            bounds = source[0].rect
            clip = (
                fitz.Rect(
                    transform.x * bounds.width,
                    transform.y * bounds.height,
                    (transform.x + transform.width) * bounds.width,
                    (transform.y + transform.height) * bounds.height,
                )
                if transform.type == "crop"
                else bounds
            )
            rotated = transform.type == "rotate"
            width, height = (
                (clip.height, clip.width) if rotated else (clip.width, clip.height)
            )
            page = cropped.new_page(width=width, height=height)
            page.show_pdf_page(
                page.rect, source, 0, clip=clip, rotate=-90 if rotated else 0
            )
            if transform.type.startswith("mirror"):
                matrix = (
                    f"-1 0 0 1 {width} 0"
                    if transform.type == "mirror_horizontal"
                    else f"1 0 0 -1 0 {height}"
                )
                for xref in page.get_contents():
                    content = cropped.xref_stream(xref)
                    cropped.update_stream(
                        xref, f"q {matrix} cm\n".encode() + content + b"\nQ"
                    )
            data = cropped.tobytes(garbage=3)
    return frame_background(data, fixed)


def frame_background(data: bytes, fixed: fitz.Rect) -> bytes:
    with fitz.open(stream=data) as source, fitz.open() as framed:
        if source[0].rect == fixed:
            return data
        page = framed.new_page(width=fixed.width, height=fixed.height)
        page.draw_rect(page.rect, color=None, fill=(1, 1, 1))
        page.show_pdf_page(page.rect, source, 0)
        return framed.tobytes(garbage=3)


class ImageLayout(BaseModel):
    page_size: Literal["image", "a4", "letter"] = Field(
        default="image", alias="pageSize"
    )
    orientation: Literal["auto", "portrait", "landscape"] = "auto"
    margin: float = Field(default=0, ge=0, le=144, allow_inf_nan=False)
    fit: Literal["contain", "no-upscale"] = "contain"
    transforms: list[ImageTransform] = Field(default_factory=list, max_length=64)
    background: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")


def validate_raster(data: bytes) -> tuple[int, int]:
    if not data or len(data) > MAX_BYTES:
        raise ValueError("Image vide ou supérieure à 32 Mio.")
    width, height = raster_dimensions(data)
    if (
        not (0 < width <= 20_000 and 0 < height <= 20_000)
        or width * height > 40_000_000
    ):
        raise ValueError("Image trop grande : 40 Mpx maximum, 20 000 pixels par axe.")
    if data.startswith(b"\x89PNG"):
        at = 8
        seen_data = False
        ended = False
        while at + 12 <= len(data):
            size = int.from_bytes(data[at : at + 4], "big")
            kind = data[at + 4 : at + 8]
            end = at + 8 + size
            if end + 4 > len(data) or zlib.crc32(data[at + 4 : end]) != int.from_bytes(
                data[end : end + 4], "big"
            ):
                raise ValueError("PNG corrompu.")
            if kind == b"acTL":
                raise ValueError("Les images animées ne sont pas prises en charge.")
            seen_data |= kind == b"IDAT"
            at = end + 4
            if kind == b"IEND":
                ended = size == 0 and at == len(data)
                break
        if not seen_data or not ended:
            raise ValueError("PNG incomplet.")
    elif b"\xff\xd9" not in data[-32:]:
        raise ValueError("JPEG incomplet.")
    return width, height


def images_to_pdf(images: list[bytes], layout: ImageLayout) -> bytes:
    """Build a PDF with per-file and aggregate allocation guards."""
    if not 1 <= len(images) <= 250 or sum(map(len, images)) > MAX_TOTAL_BYTES:
        raise ValueError("Budget dépassé : 250 images / 192 Mio maximum.")
    dimensions = [validate_raster(data) for data in images]
    if sum(w * h for w, h in dimensions) > MAX_TOTAL_PIXELS:
        raise ValueError("Budget dépassé : 128 millions de pixels par conversion.")
    color = tuple(int(layout.background[i : i + 2], 16) / 255 for i in (1, 3, 5))
    with fitz.open() as output:
        for data, (w, h) in zip(images, dimensions, strict=True):
            # Force full decoding to reject truncated streams before embedding them.
            pixmap = fitz.Pixmap(data)
            if (pixmap.width, pixmap.height) != (w, h):
                raise ValueError("Dimensions incohérentes.")
            del pixmap
            is_png = data.startswith(b"\x89PNG")
            oriented_pdf = None
            if not is_png:
                with fitz.open(stream=data) as source:
                    oriented_pdf = source.convert_to_pdf()
                with fitz.open(stream=oriented_pdf) as oriented:
                    a, b, _, _, _, _ = oriented[0].get_image_info()[0]["transform"]
                    if abs(b) > abs(a):
                        w, h = h, w
            iw, ih = w, h
            landscape = iw > ih
            iw, ih = (
                iw * 0.75,
                ih * 0.75,
            )  # Explicit 96 dpi, metadata is not trusted.
            if layout.page_size == "image":
                pw, ph = iw + layout.margin * 2, ih + layout.margin * 2
            else:
                pw, ph = fitz.paper_size(layout.page_size)
            if layout.orientation == "landscape" or (
                layout.orientation == "auto" and landscape
            ):
                pw, ph = max(pw, ph), min(pw, ph)
            elif layout.orientation == "portrait":
                pw, ph = min(pw, ph), max(pw, ph)
            area = fitz.Rect(
                layout.margin, layout.margin, pw - layout.margin, ph - layout.margin
            )
            if area.width <= 0 or area.height <= 0:
                raise ValueError("Marges trop grandes pour cette page.")
            scale = min(area.width / iw, area.height / ih)
            if layout.fit == "no-upscale":
                scale = min(scale, 1)
            width, height = iw * scale, ih * scale
            target = fitz.Rect(
                (pw - width) / 2,
                (ph - height) / 2,
                (pw + width) / 2,
                (ph + height) / 2,
            )
            page = output.new_page(width=pw, height=ph)
            page.draw_rect(page.rect, color=None, fill=color)
            if is_png:
                page.insert_image(target, stream=data, keep_proportion=True)
            else:
                with fitz.open(stream=oriented_pdf, filetype="pdf") as oriented:
                    # The PDF's original box can reflect unequal X/Y DPI.
                    page.show_pdf_page(target, oriented, 0, keep_proportion=False)
        result = output.tobytes(garbage=4, deflate=True)
        if layout.transforms:
            if len(images) != 1:
                raise ValueError("Les transformations concernent une seule image.")
            result = transform_background(result, layout.transforms)
        return result


@router.post("/images/pdf")
async def convert_images(
    files: Annotated[list[UploadFile], File()],
    options: Annotated[str, Form()] = "{}",
) -> Response:
    try:
        layout = ImageLayout.model_validate_json(options)
    except ValidationError as error:
        raise HTTPException(422, "Options de mise en page invalides.") from error
    if not 1 <= len(files) <= 250:
        raise HTTPException(413, "Choisissez entre 1 et 250 images.")
    images: list[bytes] = []
    total = 0
    try:
        for file in files:
            data = await file.read(MAX_BYTES + 1)
            validate_raster(data)  # Content, never extension or declared MIME.
            total += len(data)
            if total > MAX_TOTAL_BYTES:
                raise ValueError("Budget dépassé : 192 Mio compressés maximum.")
            images.append(data)
        # Keep PyMuPDF on the same thread as the existing PDF export routes.
        result = images_to_pdf(images, layout)
    except (
        ValueError,
        RuntimeError,
        fitz.FileDataError,
        fitz.mupdf.FzErrorBase,
    ) as error:
        raise HTTPException(
            422,
            "Image invalide ou budget dépassé (PNG/JPEG, 32 Mio, 40 Mpx par image ; 128 Mpx au total).",
        ) from error
    return Response(result, media_type="application/pdf")

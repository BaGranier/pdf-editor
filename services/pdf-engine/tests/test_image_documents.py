from __future__ import annotations

import asyncio
import io
import struct
import zlib
from pathlib import Path

import fitz
import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError

from app.image_documents import ImageLayout, convert_images, images_to_pdf

FIXTURES = Path(__file__).resolve().parents[3] / "apps/web/e2e/fixtures"


def png(width=40, height=20, rgba=(255, 0, 0, 128)):
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data))
        )

    raw = (b"\0" + bytes(rgba) * width) * height
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_native_jpeg_and_oriented_jpeg_keep_ratio_and_encoded_stream():
    for name, size in [
        ("editor-image.jpg", (120, 60)),
        ("editor-image-oriented.jpg", (60, 120)),
    ]:
        source = (FIXTURES / name).read_bytes()
        with fitz.open(stream=images_to_pdf([source], ImageLayout())) as pdf:
            assert pdf.page_count == 1
            assert tuple(pdf[0].rect)[2:] == size
            assert any(
                pdf.extract_image(item[0])["image"] == source
                for item in pdf[0].get_images()
            )
            with fitz.open(stream=source) as original:
                expected = original[0].get_pixmap()
                actual = pdf[0].get_pixmap()
                assert actual.samples == expected.samples


@pytest.mark.parametrize(
    "background,expected", [("#ffffff", (255, 126, 126)), ("#0000ff", (128, 0, 126))]
)
def test_alpha_has_explicit_background_and_pdf_mask(background, expected):
    with fitz.open(
        stream=images_to_pdf([png()], ImageLayout(background=background))
    ) as pdf:
        assert pdf[0].get_pixmap().pixel(10, 5) == pytest.approx(expected, abs=2)
        assert pdf[0].get_images()[0][1] > 0


def test_three_pages_order_mixed_sizes_a4_letter_and_no_upscale():
    sources = [
        png(rgba=color)
        for color in [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255)]
    ]
    for size in ["a4", "letter", "image"]:
        layout = ImageLayout(
            pageSize=size, margin=4, fit="no-upscale", orientation="portrait"
        )
        with fitz.open(stream=images_to_pdf(sources, layout)) as pdf:
            assert pdf.page_count == 3
            for page, color in zip(
                pdf, [(255, 0, 0), (0, 255, 0), (0, 0, 255)], strict=True
            ):
                assert page.rect.height >= page.rect.width
                assert (
                    page.get_pixmap().pixel(
                        int(page.rect.width / 2), int(page.rect.height / 2)
                    )
                    == color
                )
                bbox = page.get_image_info()[0]["bbox"]
                assert bbox[2] - bbox[0] == pytest.approx(min(30, page.rect.width - 8))
                assert bbox[3] - bbox[1] == pytest.approx(
                    min(30, page.rect.width - 8) / 2
                )


def test_image_size_pages_can_differ():
    with fitz.open(
        stream=images_to_pdf([png(40, 20), png(20, 60)], ImageLayout())
    ) as pdf:
        assert pdf[0].rect.width == 30
        assert pdf[1].rect.height == 45


@pytest.mark.parametrize(
    "source",
    [
        b"",
        b"%PDF-1.7",
        b"GIF89a",
        b"RIFFxxxxWEBP",
        b"not an image",
        png()[:24],
        png()[:16] + struct.pack(">II", 20000, 20000) + png()[24:],
    ],
)
def test_bad_sources_rejected_even_with_png_filename_and_mime(source):
    upload = UploadFile(filename="fake.png", file=io.BytesIO(source))
    with pytest.raises(HTTPException) as failure:
        asyncio.run(convert_images([upload], "{}"))
    assert failure.value.status_code == 422


@pytest.mark.parametrize(
    "options",
    ['{"margin":-1}', '{"pageSize":"bad"}', '{"background":"red"}', "invalid"],
)
def test_invalid_endpoint_options(options):
    with pytest.raises(HTTPException):
        asyncio.run(convert_images([UploadFile(file=io.BytesIO(png()))], options))


def test_endpoint_ignores_misleading_filename_and_content_type():
    response = asyncio.run(
        convert_images([UploadFile(filename="wrong.bin", file=io.BytesIO(png()))], "{}")
    )
    with fitz.open(stream=response.body) as pdf:
        assert pdf.page_count == 1


def test_limits_and_invalid_page_area():
    with pytest.raises(ValueError):
        images_to_pdf([png()] * 251, ImageLayout())
    with pytest.raises(ValueError):
        images_to_pdf([], ImageLayout())
    with pytest.raises(ValidationError):
        ImageLayout(margin=float("nan"))


def quadrants():
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 20), False)
    for y in range(20):
        for x in range(40):
            color = [(255, 0, 0), (0, 0, 255), (0, 255, 0), (255, 255, 0)][
                (y >= 10) * 2 + (x >= 20)
            ]
            pix.set_pixel(x, y, color)
    return pix.tobytes("png")


@pytest.mark.parametrize(
    "kind,points,colors",
    [
        ("mirror_horizontal", [(3, 3), (25, 3)], [(0, 0, 255), (255, 0, 0)]),
        ("mirror_vertical", [(3, 3), (25, 3)], [(0, 255, 0), (255, 255, 0)]),
        (
            "rotate",
            [(13, 3), (17, 3), (13, 11), (17, 11)],
            [(0, 255, 0), (255, 0, 0), (255, 255, 0), (0, 0, 255)],
        ),
    ],
)
def test_background_transforms_render_without_changing_document_coordinates(
    kind, points, colors
):
    with fitz.open(
        stream=images_to_pdf([quadrants()], ImageLayout(transforms=[{"type": kind}]))
    ) as pdf:
        assert pdf[0].rect == fitz.Rect(0, 0, 30, 15)
        pix = pdf[0].get_pixmap()
        for point, color in zip(points, colors, strict=True):
            assert pix.pixel(*point) == color


def test_crop_and_mirror_order_is_preserved_and_original_remains_identical():
    source = quadrants()
    crop = {"type": "crop", "x": 0, "y": 0, "width": 0.5, "height": 1}
    for operations, expected in [
        ([{"type": "mirror_horizontal"}, crop], (0, 0, 255)),
        ([crop, {"type": "mirror_horizontal"}], (255, 0, 0)),
    ]:
        with fitz.open(
            stream=images_to_pdf([source], ImageLayout(transforms=operations))
        ) as pdf:
            assert pdf[0].get_pixmap().pixel(15, 3) == expected
            assert pdf[0].get_pixmap().pixel(0, 3) == (255, 255, 255)
    assert quadrants() == source


def test_invalid_transforms_and_aggregate_pixel_budget():
    for transform in [
        {"type": "crop", "x": 0.8, "width": 0.5},
        {"type": "crop", "width": 0},
        {"type": "filter"},
    ]:
        with pytest.raises(ValidationError):
            ImageLayout(transforms=[transform])
    with pytest.raises(ValidationError):
        ImageLayout(transforms=[{"type": "rotate"}] * 65)
    with pytest.raises(ValueError):
        images_to_pdf([png(), png()], ImageLayout(transforms=[{"type": "rotate"}]))


@pytest.mark.parametrize("orientation", range(1, 9))
def test_all_jpeg_exif_orientations_match_expected_pixel_mapping(orientation):
    original = (FIXTURES / "editor-image.jpg").read_bytes()
    exif = (
        b"Exif\0\0II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0"
        + struct.pack("<H", orientation)
        + b"\0\0\0\0\0\0"
    )
    source = (
        original[:2]
        + b"\xff\xe1"
        + struct.pack(">H", len(exif) + 2)
        + exif
        + original[2:]
    )
    decoded = fitz.Pixmap(original)
    w, h = decoded.width, decoded.height
    with fitz.open(stream=images_to_pdf([source], ImageLayout())) as pdf:
        pix = pdf[0].get_pixmap(matrix=fitz.Matrix(4 / 3, 4 / 3))
        assert (pix.width, pix.height) == ((h, w) if orientation >= 5 else (w, h))
        for x, y in [
            (pix.width // 4, pix.height // 4),
            (pix.width * 3 // 4, pix.height * 3 // 4),
        ]:
            sx, sy = {
                1: (x, y),
                2: (w - 1 - x, y),
                3: (w - 1 - x, h - 1 - y),
                4: (x, h - 1 - y),
                5: (y, x),
                6: (y, h - 1 - x),
                7: (w - 1 - y, h - 1 - x),
                8: (w - 1 - y, x),
            }[orientation]
            assert pix.pixel(x, y) == pytest.approx(decoded.pixel(sx, sy), abs=3)


def test_four_turns_restore_exact_original_framing():
    source = quadrants()
    with (
        fitz.open(stream=images_to_pdf([source], ImageLayout())) as original,
        fitz.open(
            stream=images_to_pdf(
                [source], ImageLayout(transforms=[{"type": "rotate"}] * 4)
            )
        ) as rotated,
    ):
        assert rotated[0].get_pixmap().samples == original[0].get_pixmap().samples


def test_jpeg_unequal_density_does_not_change_pixel_aspect_ratio():
    source = bytearray((FIXTURES / "editor-image.jpg").read_bytes())
    start = source.find(b"JFIF\0")
    assert start >= 0
    source[start + 7 : start + 12] = b"\x01\x01\x2c\x00\x48"
    with fitz.open(stream=images_to_pdf([bytes(source)], ImageLayout())) as pdf:
        assert pdf[0].rect == fitz.Rect(0, 0, 120, 60)
        assert tuple(pdf[0].get_image_info()[0]["bbox"]) == pytest.approx(
            (0, 0, 120, 60)
        )

from __future__ import annotations

import base64
import io
import random
import shutil
import subprocess
from pathlib import Path

import fitz
import pytest
from pydantic import ValidationError
from pypdf import PdfReader

from app import main
from app.export_options import ExportOptions


def source_pdf(image_heavy: bool = False, form: bool = False) -> bytes:
    with fitz.open() as doc:
        page = doc.new_page(width=400, height=400)
        page.insert_text((20, 30), "Selectable vector text")
        if image_heavy:
            # Reproducible detailed RGB image at 432 DPI; no external binary fixture.
            samples = random.Random(41).randbytes(1200 * 1200 * 3)
            pix = fitz.Pixmap(fitz.csRGB, 1200, 1200, samples, False)
            page.insert_image(fitz.Rect(0, 0, 200, 200), pixmap=pix)
        if form:
            widget = fitz.Widget()
            widget.field_name = "name"
            widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
            widget.field_value = "Alice"
            widget.rect = fitz.Rect(30, 70, 190, 100)
            page.add_widget(widget)
            note = page.add_text_annot((200, 100), "Retained comment")
            note.update()
        return doc.tobytes()


def export(source: bytes, **payload: object) -> bytes:
    plan = main.OrganizeExportPlan.model_validate(
        {"pages": [{"sourcePageIndex": 0}], **payload}
    )
    return main.export_organized_pdf({"source": source}, plan)


def image_asset(kind: str = "png") -> dict[str, object]:
    pix = fitz.Pixmap(fitz.csRGB, 60, 30, bytes([255, 0, 0]) * 60 * 30, False)
    mime = "image/png" if kind == "png" else "image/jpeg"
    return {
        "id": "asset",
        "mimeType": mime,
        "width": 60,
        "height": 30,
        "dataUrl": f"data:{mime};base64,{base64.b64encode(pix.tobytes(kind)).decode()}",
    }


@pytest.mark.parametrize("kind", ["png", "jpeg"])
@pytest.mark.parametrize(
    "image_order, opacity, expected",
    [(0, 1, (0, 0, 255)), (0, 0.5, (126, 0, 128)), (2, 0.5, (255, 0, 0))],
)
def test_image_geometry_and_alpha_z_order(
    kind: str, image_order: int, opacity: float, expected: tuple[int, int, int]
) -> None:
    rect = {"x0": 50, "y0": 100, "x1": 250, "y1": 200}
    output = export(
        source_pdf(),
        images=[
            {
                "id": "image",
                "type": "image",
                "page": 1,
                "rect": rect,
                "imageId": "asset",
                "order": image_order,
            }
        ],
        signatureImages=[image_asset(kind)],
        shapes=[
            {
                "id": "overlay",
                "type": "shape",
                "page": 1,
                "shapeType": "rectangle",
                "rect": rect,
                "order": 1,
                "style": {
                    "strokeColor": "#0000ff",
                    "strokeWidth": 1,
                    "fillColor": "#0000ff",
                    "opacity": opacity,
                },
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        assert len(doc[0].get_images()) == 1
        bbox = doc[0].get_image_rects(doc[0].get_images()[0][0])[0]
        assert tuple(bbox) == pytest.approx((50, 200, 250, 300))
        assert bbox.width / bbox.height == 2
        pixel = doc[0].get_pixmap().pixel(100, 250)
        assert pixel == pytest.approx(expected, abs=4)
    assert PdfReader(io.BytesIO(output)).pages[0]


def test_controlled_image_fixture_profiles_preserve_text_and_reduce_size() -> None:
    source = source_pdf(image_heavy=True)
    results = {
        quality: export(source, exportOptions={"quality": quality})
        for quality in ("maximum", "balanced", "small")
    }
    dimensions = {}
    for quality, output in results.items():
        with fitz.open(stream=output) as doc:
            assert "Selectable vector text" in doc[0].get_text()
            dimensions[quality] = max(image[2] for image in doc[0].get_images())
        assert len(PdfReader(io.BytesIO(output)).pages) == 1
    assert len(results["small"]) < len(results["balanced"]) < len(results["maximum"])
    assert dimensions["maximum"] > dimensions["balanced"] > dimensions["small"]


@pytest.mark.parametrize("image_heavy", [False, True])
def test_maximum_profile_is_lossless_for_images(image_heavy: bool) -> None:
    source = source_pdf(image_heavy=image_heavy)
    output = export(source, exportOptions={"quality": "maximum"})
    with fitz.open(stream=source) as before, fitz.open(stream=output) as after:
        assert before[0].get_pixmap().samples == after[0].get_pixmap().samples


def test_flatten_policy_preserves_visuals_and_keeps_comments_by_default() -> None:
    source = source_pdf(form=True)
    preserved = export(source, exportOptions={"quality": "maximum"})
    flattened = export(source, exportOptions={"flattenForms": True})
    all_flattened = export(
        source, exportOptions={"flattenForms": True, "flattenAnnotations": True}
    )
    with fitz.open(stream=preserved) as before, fitz.open(stream=flattened) as after:
        assert list(before[0].widgets())
        assert not list(after[0].widgets())
        assert list(after[0].annots())[0].info["content"] == "Retained comment"
        assert before[0].get_pixmap().samples == after[0].get_pixmap().samples
        assert "Alice" in after[0].get_text()
    with fitz.open(stream=all_flattened) as doc:
        assert not list(doc[0].annots())
        assert not list(doc[0].widgets())


def test_encryption_permissions_and_independent_reader() -> None:
    output = export(
        source_pdf(),
        exportOptions={
            "openPassword": "user-test",
            "ownerPassword": "owner-test",
            "allowPrinting": False,
            "allowModification": False,
        },
    )
    with fitz.open(stream=output) as doc:
        assert doc.needs_pass
        assert not doc.authenticate("wrong")
        assert doc.authenticate("user-test")
        assert not doc.permissions & fitz.PDF_PERM_PRINT
        assert not doc.permissions & fitz.PDF_PERM_MODIFY
        assert "Selectable vector text" in doc[0].get_text()


def test_aes_with_independent_reader_when_crypto_is_available() -> None:
    pytest.importorskip(
        "cryptography",
        reason="pypdf AES verification needs an optional crypto dependency absent from this environment",
    )
    output = export(
        source_pdf(),
        exportOptions={"openPassword": "user-test", "ownerPassword": "owner-test"},
    )
    reader = PdfReader(io.BytesIO(output))
    assert reader.is_encrypted
    assert reader.decrypt("wrong") == 0
    assert reader.decrypt("user-test") != 0
    assert "Selectable vector text" in reader.pages[0].extract_text()


def test_rejects_unusable_security_without_exposing_secrets() -> None:
    with pytest.raises(ValidationError):
        ExportOptions.model_validate({"allowModification": False})
    with pytest.raises(ValidationError):
        ExportOptions.model_validate(
            {"ownerPassword": "same", "openPassword": "same", "allowPrinting": False}
        )
    options = ExportOptions.model_validate({"openPassword": "secret"})
    assert "secret" not in repr(options)
    with pytest.raises(main.HTTPException) as error:
        main.parse_organize_plan(
            '{"pages":[],"exportOptions":{"openPassword":"secret","quality":"bad"}}'
        )
    assert "secret" not in str(error.value.detail)


@pytest.mark.parametrize(
    "start, end",
    [
        ((20, 200), (300, 200)),
        ((200, 20), (200, 300)),
        ((20, 20), (300, 300)),
        ((300, 20), (20, 300)),
        ((100, 100), (101, 101)),
    ],
)
@pytest.mark.parametrize("width", [1, 8])
def test_arrows_are_vectorial_and_follow_endpoints(
    start: tuple[int, int], end: tuple[int, int], width: int
) -> None:
    output = export(
        source_pdf(),
        shapes=[
            {
                "id": "arrow",
                "type": "shape",
                "shapeType": "line",
                "lineStyle": "arrow",
                "page": 1,
                "rect": {
                    "x0": min(start[0], end[0]),
                    "y0": min(start[1], end[1]),
                    "x1": max(start[0], end[0]) + 1,
                    "y1": max(start[1], end[1]) + 1,
                },
                "start": dict(zip(("x", "y"), start)),
                "end": dict(zip(("x", "y"), end)),
                "style": {
                    "strokeColor": "#123456",
                    "strokeWidth": width,
                    "opacity": 0.5,
                },
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        drawings = doc[0].get_drawings()
        assert len(drawings) >= 1
        assert drawings[0]["width"] == width
        assert drawings[0]["stroke_opacity"] == 0.5
        assert not doc[0].get_images()
        point = drawings[0]["items"][0][2]
        assert tuple(point) == pytest.approx((end[0], 400 - end[1]))


def test_aes_with_independent_qpdf(tmp_path: Path) -> None:
    if not shutil.which("qpdf"):
        pytest.skip("Independent qpdf verifier is unavailable")
    source = tmp_path / "protected.pdf"
    source.write_bytes(
        export(
            source_pdf(),
            exportOptions={
                "openPassword": "synthetic-user",
                "ownerPassword": "synthetic-owner",
                "allowPrinting": False,
                "allowModification": False,
            },
        )
    )
    checked = subprocess.run(
        ["qpdf", "--password=synthetic-user", "--check", str(source)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert checked.returncode == 0, checked.stdout + checked.stderr
    decrypted = tmp_path / "decrypted.pdf"
    subprocess.run(
        ["qpdf", "--password=synthetic-user", "--decrypt", str(source), str(decrypted)],
        capture_output=True,
        check=True,
    )
    reader = PdfReader(decrypted)
    assert not reader.is_encrypted
    assert "Selectable vector text" in reader.pages[0].extract_text()


@pytest.mark.parametrize("kind", ["square", "circle"])
def test_constrained_shape_export(kind: str) -> None:
    output = export(
        source_pdf(),
        shapes=[
            {
                "id": kind,
                "type": "shape",
                "shapeType": kind,
                "page": 1,
                "rect": {"x0": 20, "y0": 30, "x1": 90, "y1": 100},
                "style": {"strokeColor": "#000000", "strokeWidth": 2},
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        rect = doc[0].get_drawings()[0]["rect"]
        assert rect.width == pytest.approx(rect.height)


@pytest.mark.parametrize("quality", ["maximum", "balanced", "small"])
def test_compression_preserves_added_png_alpha(quality: str) -> None:
    # Premultiplied 50% red over the white page must remain pink, not opaque red.
    pix = fitz.Pixmap(fitz.csRGB, 600, 300, bytes([128, 0, 0, 128]) * 600 * 300, True)
    asset = {
        "id": "alpha",
        "mimeType": "image/png",
        "width": 600,
        "height": 300,
        "dataUrl": "data:image/png;base64,"
        + base64.b64encode(pix.tobytes("png")).decode(),
    }
    output = export(
        source_pdf(),
        exportOptions={"quality": quality},
        signatureImages=[asset],
        images=[
            {
                "id": "image",
                "type": "image",
                "page": 1,
                "imageId": "alpha",
                "rect": {"x0": 50, "y0": 100, "x1": 250, "y1": 200},
            }
        ],
    )
    with fitz.open(stream=output) as doc:
        assert doc[0].get_pixmap().pixel(100, 250) == pytest.approx(
            (255, 127, 127), abs=5
        )
        assert doc[0].get_images()[0][1] > 0  # soft mask preserved

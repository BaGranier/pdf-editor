"""Final export policy: preserve vector content and keep all secrets ephemeral."""

from __future__ import annotations

import secrets
import math
from typing import Literal

import fitz
from fastapi import HTTPException
from pydantic import BaseModel, Field, SecretStr, model_validator


class ExportOptions(BaseModel):
    quality: Literal["maximum", "balanced", "small"] = "maximum"
    flatten_forms: bool = Field(default=False, alias="flattenForms")
    flatten_annotations: bool = Field(default=False, alias="flattenAnnotations")
    open_password: SecretStr = Field(
        default=SecretStr(""), alias="openPassword", repr=False
    )
    owner_password: SecretStr = Field(
        default=SecretStr(""), alias="ownerPassword", repr=False
    )
    allow_printing: bool = Field(default=True, alias="allowPrinting")
    allow_modification: bool = Field(default=True, alias="allowModification")

    @model_validator(mode="after")
    def validate_security(self) -> ExportOptions:
        for password in (self.open_password, self.owner_password):
            if len(password.get_secret_value().encode("utf-8")) > 40:
                raise ValueError("Le mot de passe dépasse 40 octets UTF-8.")
        if not (self.allow_printing and self.allow_modification):
            owner = self.owner_password.get_secret_value()
            if not owner or owner == self.open_password.get_secret_value():
                raise ValueError(
                    "Un mot de passe propriétaire distinct est requis pour les permissions."
                )
        return self


def compress_export_images(document: fitz.Document, quality: str) -> None:
    """Replace each safe image xref once, preserving every placement and font.

    MuPDF 1.26.3 rewrite_images corrupts shared font references and repeatedly
    downsamples shared images. Avoid that page-stream rewriter entirely.
    Complex colour spaces, masks and oversized images retain their source data.
    """
    target, threshold, jpeg_quality = (
        (180, 225, 85) if quality == "balanced" else (100, 125, 65)
    )
    images: dict[int, tuple[tuple, float, float]] = {}
    for page in document:
        for image in page.get_images(full=True):
            xref, mask, width, height, bits, colorspace = image[:6]
            if (
                not xref
                or mask
                or bits != 8
                or width * height > 40_000_000
                or colorspace not in {"DeviceRGB", "DeviceGray", "ICCBased"}
                or document.xref_get_key(xref, "Mask")[0] != "null"
                or document.xref_get_key(xref, "SMask")[0] != "null"
            ):
                continue
            # Measure the largest use across all pages before changing any xref.
            # Matrix axis lengths also cover rotation and free aspect ratios.
            uses = page.get_image_rects(xref, transform=True)
            horizontal = max((math.hypot(m.a, m.b) for _, m in uses), default=0)
            vertical = max((math.hypot(m.c, m.d) for _, m in uses), default=0)
            previous = images.get(xref)
            if previous:
                horizontal = max(horizontal, previous[1])
                vertical = max(vertical, previous[2])
            images[xref] = (image, horizontal, vertical)
    for xref, (image, horizontal, vertical) in images.items():
        width, height = image[2:4]
        if not horizontal or not vertical:
            continue
        if min(width * 72 / horizontal, height * 72 / vertical) <= threshold:
            continue
        scale = max(
            horizontal * target / (72 * width), vertical * target / (72 * height)
        )
        pixel_width = max(1, math.ceil(width * scale))
        pixel_height = max(1, math.ceil(height * scale))
        pixels = fitz.Pixmap(document, xref)
        if not pixels.colorspace or pixels.colorspace.n not in {1, 3}:
            continue
        # Convert ICC RGB/gray to the matching standard space before JPEG output;
        # never keep a source CMYK/Indexed declaration around RGB JPEG bytes.
        pixels = fitz.Pixmap(
            fitz.csRGB if pixels.colorspace.n == 3 else fitz.csGRAY, pixels
        )
        resized = fitz.Pixmap(pixels, pixel_width, pixel_height, None)
        if resized.alpha:
            resized = fitz.Pixmap(resized, 0)
        jpeg = resized.tobytes("jpeg", jpg_quality=jpeg_quality)
        color_name = "DeviceRGB" if resized.colorspace.n == 3 else "DeviceGray"
        # Update the existing opaque 8-bit image stream directly. Page.replace_image
        # also adds an unused resource alias via a temporary drawing operation.
        document.update_object(
            xref,
            f"<< /Type /XObject /Subtype /Image /Width {pixel_width} "
            f"/Height {pixel_height} /BitsPerComponent 8 /ColorSpace /{color_name} >>",
        )
        document.update_stream(xref, jpeg, compress=False)
        document.xref_set_key(xref, "Filter", "/DCTDecode")


def finalize_export(source: bytes, options: ExportOptions | None) -> bytes:
    if options is None:
        return source  # Historical payloads retain their previous output policy.
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            page_count = document.page_count
            if options.quality != "maximum":
                compress_export_images(document, options.quality)
            if options.flatten_forms or options.flatten_annotations:
                document.bake(
                    widgets=options.flatten_forms, annots=options.flatten_annotations
                )
            user = options.open_password.get_secret_value()
            owner = options.owner_password.get_secret_value()
            permissions = fitz.PDF_PERM_ACCESSIBILITY | fitz.PDF_PERM_COPY
            if options.allow_printing:
                permissions |= fitz.PDF_PERM_PRINT | fitz.PDF_PERM_PRINT_HQ
            if options.allow_modification:
                permissions |= (
                    fitz.PDF_PERM_MODIFY
                    | fitz.PDF_PERM_ANNOTATE
                    | fitz.PDF_PERM_FORM
                    | fitz.PDF_PERM_ASSEMBLE
                )
            encrypted = bool(user or owner)
            output = document.tobytes(
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                use_objstms=1,
                encryption=fitz.PDF_ENCRYPT_AES_256
                if encrypted
                else fitz.PDF_ENCRYPT_NONE,
                user_pw=user or None,
                owner_pw=(owner or secrets.token_urlsafe(24)) if encrypted else None,
                permissions=permissions,
            )
        with fitz.open(stream=output, filetype="pdf") as validation:
            if encrypted and not validation.authenticate(owner or user):
                raise ValueError("export authentication")
            if validation.page_count != page_count:
                raise ValueError("export page count")
            for page in validation:
                # Force parsing of each final page before the destination is written.
                page.get_contents()
        return output
    except (RuntimeError, ValueError) as error:
        # No exception details: PDF and password data must not reach logs/responses.
        raise HTTPException(
            status_code=422, detail="La finalisation du PDF a échoué."
        ) from error

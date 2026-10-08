"""Final export policy: preserve vector content and keep all secrets ephemeral."""

from __future__ import annotations

import secrets
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


def finalize_export(source: bytes, options: ExportOptions | None) -> bytes:
    if options is None:
        return source  # Historical payloads retain their previous output policy.
    try:
        with fitz.open(stream=source, filetype="pdf") as document:
            page_count = document.page_count
            if options.quality != "maximum":
                target, threshold, quality = (
                    (180, 225, 85) if options.quality == "balanced" else (100, 125, 65)
                )
                document.rewrite_images(
                    dpi_threshold=threshold, dpi_target=target, quality=quality
                )
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

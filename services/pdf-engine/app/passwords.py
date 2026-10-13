"""Authenticate in memory; only the working PDF crosses into editor state."""

from typing import Annotated

import fitz
from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import Response

from app.ocr import MAX_PDF_SIZE_BYTES, MAX_PDF_PAGES, OcrError

router = APIRouter()
# The editor exposes all these operations. Require owner authentication when
# any of them is forbidden instead of silently dropping PDF permissions.
EDITOR_PERMISSIONS = (
    fitz.PDF_PERM_MODIFY
    | fitz.PDF_PERM_COPY
    | fitz.PDF_PERM_ANNOTATE
    | fitz.PDF_PERM_FORM
    | fitz.PDF_PERM_ASSEMBLE
    | fitz.PDF_PERM_PRINT
    | fitz.PDF_PERM_PRINT_HQ
)


def unlock_pdf(source: bytes, password: str | None = None) -> bytes:
    try:
        if not source.startswith(b"%PDF-"):
            raise ValueError
        with fitz.open(stream=source, filetype="pdf") as document:
            if document.is_encrypted or (document.metadata or {}).get("encryption"):
                if password is None:
                    raise OcrError(
                        401,
                        "PDF_PASSWORD_REQUIRED",
                        "Ce document nécessite un mot de passe.",
                    )
                authentication = document.authenticate(password)
                if not authentication:
                    raise OcrError(
                        401,
                        "PDF_PASSWORD_INVALID",
                        "Mot de passe incorrect. Réessayez.",
                    )
                if (
                    not authentication & 4
                    and document.permissions & EDITOR_PERMISSIONS != EDITOR_PERMISSIONS
                ):
                    raise OcrError(
                        403,
                        "PDF_PERMISSION_DENIED",
                        "Ce mot de passe ne permet pas tous les outils de l’éditeur. Utilisez le mot de passe propriétaire.",
                    )
            if not document.page_count:
                raise ValueError
            if document.page_count > MAX_PDF_PAGES:
                raise OcrError(
                    422, "PDF_PAGE_LIMIT_EXCEEDED", "Le PDF dépasse 500 pages."
                )
            return document.tobytes(
                encryption=fitz.PDF_ENCRYPT_NONE, garbage=2, deflate=True
            )
    except OcrError:
        raise
    except NotImplementedError as error:
        raise OcrError(
            422,
            "PDF_ENCRYPTION_UNSUPPORTED",
            "Ce chiffrement PDF n’est pas pris en charge.",
        ) from error
    except Exception as error:
        raise OcrError(
            400,
            "INVALID_PDF",
            "Le document PDF est invalide ou son chiffrement n’est pas pris en charge.",
        ) from error
    finally:
        password = None


@router.post("/pdf/unlock")
async def unlock(
    file: Annotated[UploadFile, File()],
    request: Request,
    password: Annotated[str | None, Form()] = None,
) -> Response:
    try:
        # FastAPI maps an explicitly submitted empty Form string to its default.
        # An empty user password is valid PDF authentication, unlike no attempt.
        if password is None and "password" in await request.form():
            password = ""
        source = await file.read(MAX_PDF_SIZE_BYTES + 1)
        if len(source) > MAX_PDF_SIZE_BYTES:
            raise OcrError(413, "PDF_TOO_LARGE", "Le document dépasse 100 Mo.")
        return Response(
            unlock_pdf(source, password),
            media_type="application/pdf",
            headers={"Cache-Control": "no-store"},
        )
    finally:
        password = None
        await file.close()

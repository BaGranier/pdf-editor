import fitz
import pytest
from app.passwords import unlock_pdf
from app.ocr import OcrError


def protected(permissions=-1):
    with fitz.open() as document:
        document.new_page().insert_text((40, 40), "Protected witness")
        return document.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw="test-open",
            owner_pw="test-owner",
            permissions=permissions,
        )


@pytest.mark.parametrize(
    "password,code",
    [(None, "PDF_PASSWORD_REQUIRED"), ("wrong", "PDF_PASSWORD_INVALID")],
)
def test_password_failure(password, code):
    source = protected()
    with pytest.raises(OcrError) as error:
        unlock_pdf(source, password)
    assert error.value.code == code
    with fitz.open(stream=source, filetype="pdf") as document:
        assert document.needs_pass


def test_unlock_retry_export_and_source_preserved():
    source = protected()
    before = bytes(source)
    with pytest.raises(OcrError):
        unlock_pdf(source, "wrong")
    working = unlock_pdf(source, "test-open")
    with fitz.open(stream=working, filetype="pdf") as document:
        assert not document.is_encrypted
        assert "Protected witness" in document[0].get_text()
        document[0].insert_text((40, 80), "Edited witness")
        saved = document.tobytes()
        secured = document.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw="new-output",
            owner_pw="new-owner",
        )
    with fitz.open(stream=saved, filetype="pdf") as document:
        assert "Edited witness" in document[0].get_text()
    with fitz.open(stream=secured, filetype="pdf") as document:
        assert not document.authenticate("test-open")
        assert document.authenticate("new-output")
    assert source == before


def test_permissions_require_owner():
    source = protected(0)
    with pytest.raises(OcrError) as error:
        unlock_pdf(source, "test-open")
    assert error.value.code == "PDF_PERMISSION_DENIED"
    assert unlock_pdf(source, "test-owner").startswith(b"%PDF-")


def test_corrupt_pdf():
    with pytest.raises(OcrError) as error:
        unlock_pdf(b"%PDF-broken", "test-open")
    assert error.value.code == "INVALID_PDF"


def test_empty_user_password_still_respects_permissions():
    with fitz.open() as document:
        document.new_page()
        source = document.tobytes(
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw="",
            owner_pw="test-owner",
            permissions=0,
        )
    with pytest.raises(OcrError) as error:
        unlock_pdf(source, "")
    assert error.value.code == "PDF_PERMISSION_DENIED"
    assert unlock_pdf(source, "test-owner").startswith(b"%PDF-")


@pytest.mark.parametrize("secured", [False, True])
def test_editor_export_after_authentication(secured):
    from app import main

    source = protected()
    before = bytes(source)
    working = unlock_pdf(source, "test-open")
    payload = {
        "pages": [{"sourcePageIndex": 0}],
        "edits": [
            {
                "id": "synthetic-edit",
                "type": "add_text",
                "page": 1,
                "rect": {"x0": 40, "y0": 80, "x1": 300, "y1": 130},
                "text": "Editor exported witness",
                "style": {
                    "fontFamily": "Helvetica",
                    "fontSize": 16,
                    "color": "#000000",
                    "bold": False,
                },
            }
        ],
    }
    if secured:
        payload["exportOptions"] = {
            "openPassword": "new-output",
            "ownerPassword": "new-owner",
        }
    output = main.export_organized_pdf(
        {"source": working}, main.OrganizeExportPlan.model_validate(payload)
    )
    with fitz.open(stream=output, filetype="pdf") as document:
        assert bool(document.needs_pass) == secured
        if secured:
            assert not document.authenticate("test-open")
            assert document.authenticate("new-output")
        assert "Editor exported witness" in document[0].get_text()
        assert "Protected witness" in document[0].get_text()
    assert source == before


def test_unsupported_encryption_hides_engine_details(monkeypatch):
    def unsupported(*args, **kwargs):
        raise NotImplementedError("internal encryption details")

    monkeypatch.setattr(fitz, "open", unsupported)
    with pytest.raises(OcrError) as error:
        unlock_pdf(b"%PDF-synthetic", "synthetic-attempt")
    assert error.value.code == "PDF_ENCRYPTION_UNSUPPORTED"
    assert "internal" not in error.value.message
    assert "synthetic-attempt" not in error.value.message

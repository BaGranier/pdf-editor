from __future__ import annotations

import io
from pathlib import Path

import fitz
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pypdf import PdfReader

from app.main import OrganizeExportPlan, export_organized_pdf


FIXTURE = (
    Path(__file__).resolve().parents[3] / "apps/web/e2e/fixtures/pdf-links-layout.pdf"
)


@pytest.fixture
def source() -> bytes:
    return FIXTURE.read_bytes()


def plan(
    source_indices: list[int], links: list[dict] | None = None, **fields
) -> OrganizeExportPlan:
    payload = {
        "pages": [
            {"sourceDocumentId": "source", "sourcePageIndex": n} for n in source_indices
        ],
        **fields,
    }
    if links is not None:
        payload["links"] = links
    return OrganizeExportPlan.model_validate(payload)


def annotations(pdf: PdfReader, index: int):
    return [ref.get_object() for ref in pdf.pages[index].annotations or []]


def link(destination, **fields):
    return {
        "sourceDocumentId": "source",
        "page": 1,
        "rect": {"x0": 32, "y0": 461, "x1": 214, "y1": 480},
        "destination": destination,
        **fields,
    }


def test_legacy_plan_keeps_named_destinations_outlines_and_text(source):
    exported = export_organized_pdf({"source": source}, plan(list(range(8))))
    pdf = PdfReader(io.BytesIO(exported))
    assert [entry["/Title"] for entry in [pdf.outline[0], pdf.outline[1][0]]] == [
        "Chapitre synthétique",
        "Sous-section synthétique",
    ]
    assert (
        pdf.get_destination_page_number(pdf.named_destinations["section-quatre"]) == 3
    )
    original = PdfReader(io.BytesIO(source))
    assert [obj["/A"]["/S"] for obj in annotations(pdf, 0)] == [
        obj["/A"]["/S"] for obj in annotations(original, 0)
    ]
    with fitz.open(stream=exported) as independent:
        assert "Renvoi direct" in independent[0].get_text()
        assert independent[0].get_images() == []


def test_create_update_delete_native_links(source):
    original = PdfReader(io.BytesIO(source))
    xref = original.pages[0].annotations[0].idnum
    add = link(
        {"kind": "internal", "pageIndex": 1, "x": 40, "y": 375},
        rect={"x0": 44, "y0": 200, "x1": 120, "y1": 230},
        label="Position cible",
    )
    update = link(
        {"kind": "uri", "url": "https://example.invalid/updated?q=1"}, sourceXref=xref
    )
    for change, uri_count in [(update, 1), (link(None, sourceXref=xref), 0)]:
        exported = export_organized_pdf(
            {"source": source},
            plan(
                list(range(8)),
                [change, add],
                exportOptions={"flattenAnnotations": True},
            ),
        )
        with fitz.open(stream=exported) as independent:
            page = independent[0]
            links = page.get_links()
            matches = [
                item
                for item in links
                if item.get("uri", "").startswith("https://example.invalid/updated")
            ]
            assert len(matches) == uri_count
            if uri_count:
                assert matches[0]["uri"] == "https://example.invalid/updated?q=1"
            placed = next(
                item for item in links if item["from"] == fitz.Rect(44, 310, 120, 340)
            )
            assert placed["kind"] == fitz.LINK_GOTO
            assert placed["page"] == 1
            assert placed["to"] == fitz.Point(40, 340)
            assert independent.get_toc()[1] == [2, "Sous-section synthétique", 4]
            assert "Site web" in page.get_text() and page.get_images() == []
        pdf = PdfReader(io.BytesIO(exported))
        assert len(annotations(pdf, 0)) == 6 + uri_count
        assert any(
            obj.get("/Contents") == "Position cible" for obj in annotations(pdf, 0)
        )
        assert any(
            obj["/A"].get("/URI") == "javascript:alert(1)"
            for obj in annotations(pdf, 0)
        )
    assert (
        annotations(original, 0)[0]["/A"]["/URI"] == "https://example.invalid/pdf-test"
    )


def test_reorganization_retargets_named_and_explicit_links_and_drops_missing(source):
    result = export_organized_pdf({"source": source}, plan([3, 0, 1, 0]))
    pdf = PdfReader(io.BytesIO(result))
    for index in (1, 3):
        go_to = [
            obj["/A"]["/D"]
            for obj in annotations(pdf, index)
            if obj["/A"]["/S"] == "/GoTo"
        ]
        assert [
            (pdf.get_page_number(dest[0].get_object()), str(dest[1])) for dest in go_to
        ] == [
            (2, "/FitH"),
            (0, "/Fit"),
        ]
    only_first = PdfReader(
        io.BytesIO(export_organized_pdf({"source": source}, plan([0])))
    )
    assert all(obj["/A"]["/S"] != "/GoTo" for obj in annotations(only_first, 0))


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "https://",
        "mailto:a@example.test",
        "https://u:p@example.test",
        "https://example.test:99999",
    ],
)
def test_link_schema_rejects_unsafe_urls(url):
    with pytest.raises(ValidationError):
        plan(list(range(8)), [link({"kind": "uri", "url": url})])


def test_rejects_out_of_bounds_and_unsupported_source_actions(source):
    original = PdfReader(io.BytesIO(source))
    launch_xref = original.pages[0].annotations[3].idnum
    for edit, error in [
        (link(None, sourceXref=launch_xref), "type de lien"),
        (link({"kind": "internal", "pageIndex": 20}), "page cible"),
        (link({"kind": "internal", "pageIndex": 1, "x": 1000}), "position cible"),
        (
            link(
                {"kind": "internal", "pageIndex": 1},
                rect={"x0": -5, "y0": 0, "x1": 10, "y1": 40},
            ),
            "rectangle",
        ),
    ]:
        with pytest.raises(HTTPException, match=error):
            export_organized_pdf({"source": source}, plan(list(range(8)), [edit]))


def test_link_areas_remain_native_on_rotated_source_page(source: bytes) -> None:
    original_plan = plan(
        list(range(8)),
        [
            link(
                {"kind": "uri", "url": "https://example.invalid/multiline"},
                rect={"x0": 20, "y0": 110, "x1": 110, "y1": 170},
                areas=[
                    {"x0": 20, "y0": 150, "x1": 80, "y1": 170},
                    {"x0": 40, "y0": 110, "x1": 110, "y1": 130},
                ],
            )
        ],
    )
    original_plan.pages[0].rotation = 90
    output = export_organized_pdf({"source": source}, original_plan)
    reopened = PdfReader(io.BytesIO(output))
    assert reopened.pages[0].rotation == 90
    annotation = annotations(reopened, 0)[-1]
    assert annotation["/Rect"] == [20, 110, 110, 170]
    assert annotation["/QuadPoints"] == [
        20,
        170,
        80,
        170,
        20,
        150,
        80,
        150,
        40,
        130,
        110,
        130,
        40,
        110,
        110,
        110,
    ]
    with fitz.open(stream=output) as independent:
        assert any(
            item.get("uri") == "https://example.invalid/multiline"
            for item in independent[0].get_links()
        )
        assert "Section 1" in independent[0].get_text()

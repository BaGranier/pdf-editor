from __future__ import annotations

import asyncio

import fitz

from app import main


def source_with_comment() -> bytes:
    document = fitz.open()
    page = document.new_page(width=400, height=400)
    annotation = page.add_text_annot(fitz.Point(40, 60), "À vérifier")
    annotation.set_info(title="QA", content="À vérifier")
    annotation.update()
    source = document.tobytes(garbage=4, deflate=True, no_new_id=True)
    document.close()
    return source


class Upload:
    content_type = "application/pdf"
    filename = "comments.pdf"

    def __init__(self, content: bytes) -> None:
        self.content = content

    async def read(self) -> bytes:
        return self.content


def test_reads_native_text_annotations() -> None:
    result = asyncio.run(main.extract_pdf_annotations(Upload(source_with_comment())))
    assert len(result["annotations"]) == 1
    comment = result["annotations"][0]
    assert comment.type == "text"
    assert comment.page_index == 0
    assert comment.content == "À vérifier"
    assert comment.author == "QA"


def test_exports_local_comment_and_preserves_existing_annotation() -> None:
    plan = main.OrganizeExportPlan.model_validate({
        "pages": [{"sourcePageIndex": 0}],
        "comments": [{
            "id": "comment-1", "type": "comment", "page": 1,
            "rect": {"x0": 120, "y0": 140, "x1": 138, "y1": 158},
            "content": "Nouveau commentaire", "author": "PDF Studio Local", "source": "local",
        }],
    })
    exported = main.export_organized_pdf({"active-document": source_with_comment()}, plan)
    with fitz.open(stream=exported, filetype="pdf") as document:
        annotation_data = [(annotation.type[1], annotation.info["content"]) for annotation in document[0].annots() or ()]
        contents = [content for _, content in annotation_data]
        assert [annotation_type for annotation_type, _ in annotation_data] == ["Text", "Text"]
    assert "À vérifier" in contents
    assert "Nouveau commentaire" in contents

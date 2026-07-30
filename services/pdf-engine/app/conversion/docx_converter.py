from __future__ import annotations

import io
import statistics
from pathlib import Path

import fitz
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.shared import Pt

from app.conversion.models import ConversionArtifact


DOCX_LAYOUT_WARNING = (
    "La conversion tente de conserver la mise en page, mais certains éléments "
    "complexes peuvent être réorganisés."
)


class PdfToDocxConverter:
    def convert(self, input_pdf: Path, output_docx: Path) -> ConversionArtifact:
        document = Document()
        with fitz.open(input_pdf) as pdf:
            for page_index, page in enumerate(pdf):
                section = (
                    document.sections[0]
                    if page_index == 0
                    else document.add_section(WD_SECTION.NEW_PAGE)
                )
                self._configure_section(section, page.rect)
                self._append_tables(document, page)
                self._append_blocks(document, page)

        document.save(output_docx)
        return ConversionArtifact(
            path=output_docx,
            filename="conversion.docx",
            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
            warnings=(DOCX_LAYOUT_WARNING,),
        )

    @staticmethod
    def _configure_section(section: object, rectangle: fitz.Rect) -> None:
        section.page_width = Pt(rectangle.width)  # type: ignore[attr-defined]
        section.page_height = Pt(rectangle.height)  # type: ignore[attr-defined]
        section.orientation = (  # type: ignore[attr-defined]
            WD_ORIENT.LANDSCAPE
            if rectangle.width > rectangle.height
            else WD_ORIENT.PORTRAIT
        )

    @staticmethod
    def _append_tables(document: Document, page: fitz.Page) -> None:
        try:
            tables = page.find_tables().tables
        except (AttributeError, RuntimeError, ValueError):
            return

        for detected_table in tables:
            cells = detected_table.extract()
            if not cells:
                continue
            column_count = max((len(row) for row in cells), default=0)
            if column_count == 0:
                continue
            table = document.add_table(rows=len(cells), cols=column_count)
            table.style = "Table Grid"
            for row_index, row in enumerate(cells):
                for column_index, value in enumerate(row):
                    table.cell(row_index, column_index).text = value or ""

    @staticmethod
    def _append_blocks(document: Document, page: fitz.Page) -> None:
        page_dictionary = page.get_text("dict", sort=True)
        font_sizes = [
            float(span.get("size", 0))
            for block in page_dictionary.get("blocks", [])
            if block.get("type") == 0
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "").strip()
        ]
        regular_size = statistics.median(font_sizes) if font_sizes else 11

        for block in page_dictionary.get("blocks", []):
            if block.get("type") == 1 and block.get("image"):
                PdfToDocxConverter._append_image(document, block["image"])
                continue
            if block.get("type") != 0:
                continue
            lines: list[str] = []
            largest_size = 0.0
            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = "".join(span.get("text", "") for span in spans).strip()
                if line_text:
                    lines.append(line_text)
                largest_size = max(
                    largest_size,
                    *(float(span.get("size", 0)) for span in spans),
                )
            text = "\n".join(lines).strip()
            if not text:
                continue
            if largest_size >= max(14, regular_size * 1.35) and len(text) < 160:
                document.add_heading(text, level=1)
            else:
                paragraph = document.add_paragraph()
                for line_index, line in enumerate(lines):
                    if line_index:
                        paragraph.add_run().add_break()
                    paragraph.add_run(line)

    @staticmethod
    def _append_image(document: Document, content: bytes) -> None:
        try:
            section = document.sections[-1]
            available_width = (
                section.page_width - section.left_margin - section.right_margin
            )
            document.add_picture(io.BytesIO(content), width=available_width)
        except (ValueError, TypeError, OSError):
            document.add_paragraph("[Image non convertible]")

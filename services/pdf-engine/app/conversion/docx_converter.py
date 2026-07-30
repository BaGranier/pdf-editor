from __future__ import annotations

import io
import logging
import re
import statistics
from collections import Counter
from pathlib import Path
from typing import Any

import fitz
from docx import Document
from docx.document import Document as DocumentType
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor

from app.conversion.models import ConversionArtifact, DocxMode


LOGGER = logging.getLogger(__name__)

DOCX_LAYOUT_WARNING = (
    "La conversion tente de conserver la mise en page, mais certains éléments "
    "complexes peuvent être réorganisés."
)
DOCX_VISUAL_WARNING = (
    "Le mode fidèle visuellement conserve chaque page comme une image ; "
    "le contenu est moins facilement modifiable."
)
DOCX_EDITABLE_DEGRADED_WARNING = (
    "La conversion Word éditable est dégradée : moins de 50 % du texte "
    "source a été reconstruit. Utilisez le PDF source pour vérifier le contenu."
)
LIST_MARKER = re.compile(
    r"^\s*(?P<marker>[-–—•▪‣●○\uf0b7]|\d+[.)])\s+"
)


def text_retention_ratio(source_text: str, converted_text: str) -> float:
    source_tokens = Counter(re.findall(r"\w+", source_text.casefold()))
    if not source_tokens:
        return 1.0
    converted_tokens = Counter(re.findall(r"\w+", converted_text.casefold()))
    retained_tokens = source_tokens & converted_tokens
    return sum(retained_tokens.values()) / sum(source_tokens.values())


class PdfToDocxConverter:
    def convert(
        self,
        input_pdf: Path,
        output_docx: Path,
        *,
        mode: DocxMode = DocxMode.EDITABLE,
    ) -> ConversionArtifact:
        document = Document()
        with fitz.open(input_pdf) as pdf:
            if mode == DocxMode.VISUAL:
                self._append_visual_pages(document, pdf)
                warnings = (DOCX_VISUAL_WARNING,)
            else:
                source_text = "\n".join(
                    page.get_text("text", sort=True) for page in pdf
                )
                self._configure_styles(document)
                self._append_editable_pages(document, pdf)
                converted_text = self._document_text(document)
                retention_ratio = text_retention_ratio(
                    source_text,
                    converted_text,
                )
                warnings = (
                    (DOCX_LAYOUT_WARNING, DOCX_EDITABLE_DEGRADED_WARNING)
                    if retention_ratio < 0.5
                    else (DOCX_LAYOUT_WARNING,)
                )

        document.save(output_docx)
        return ConversionArtifact(
            path=output_docx,
            filename="conversion.docx",
            media_type=(
                "application/vnd.openxmlformats-officedocument."
                "wordprocessingml.document"
            ),
            warnings=warnings,
        )

    @staticmethod
    def _document_text(document: DocumentType) -> str:
        return "\n".join(
            [
                *(paragraph.text for paragraph in document.paragraphs),
                *(
                    cell.text
                    for table in document.tables
                    for row in table.rows
                    for cell in row.cells
                ),
            ]
        )

    def _append_editable_pages(
        self,
        document: DocumentType,
        pdf: fitz.Document,
    ) -> None:
        for page_index, page in enumerate(pdf):
            section = (
                document.sections[0]
                if page_index == 0
                else document.add_section(WD_SECTION.NEW_PAGE)
            )
            self._configure_editable_section(section, page)
            self._append_page_content(document, page)

    def _append_visual_pages(
        self,
        document: DocumentType,
        pdf: fitz.Document,
    ) -> None:
        for page_index, page in enumerate(pdf):
            if page_index == 0:
                section = document.sections[0]
            else:
                section = document.add_section(WD_SECTION.NEW_PAGE)
                section_break = document.paragraphs[-1]
                section_break.paragraph_format.space_before = Pt(0)
                section_break.paragraph_format.space_after = Pt(0)
                # Keep the section break itself from consuming visible page
                # space. The image paragraph below deliberately stays on
                # automatic line height so Word cannot clip the drawing.
                section_break.paragraph_format.line_spacing = Pt(1)
            self._configure_visual_section(section, page.rect)
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(0)
            paragraph.paragraph_format.keep_together = True
            rendered_page = page.get_pixmap(dpi=150, alpha=False).tobytes("png")
            scale = min(
                (page.rect.width - 2) / page.rect.width,
                (page.rect.height - 8) / page.rect.height,
            )
            paragraph.add_run().add_picture(
                io.BytesIO(rendered_page),
                width=Pt(max(1, page.rect.width * scale)),
                height=Pt(max(1, page.rect.height * scale)),
            )

    @staticmethod
    def _configure_styles(document: DocumentType) -> None:
        styles = document.styles
        styles["Normal"].font.name = "Arial"
        styles["Normal"].font.size = Pt(11)
        styles["Normal"].paragraph_format.space_after = Pt(2)
        styles["Normal"].paragraph_format.line_spacing = 1.1
        styles["Title"].font.name = "Arial"
        styles["Title"].font.size = Pt(20)
        styles["Title"].font.bold = True
        styles["Title"].paragraph_format.space_before = Pt(0)
        styles["Title"].paragraph_format.space_after = Pt(3)
        styles["Title"].paragraph_format.line_spacing = 1.04
        for style_name, size in (("Heading 1", 15), ("Heading 2", 13)):
            styles[style_name].font.name = "Arial"
            styles[style_name].font.size = Pt(size)
            styles[style_name].font.bold = True
            styles[style_name].paragraph_format.space_before = Pt(4.5)
            styles[style_name].paragraph_format.space_after = Pt(2.5)
            styles[style_name].paragraph_format.line_spacing = 1.06

    @staticmethod
    def _configure_page_size(section: Any, rectangle: fitz.Rect) -> None:
        section.page_width = Pt(rectangle.width)
        section.page_height = Pt(rectangle.height)
        section.orientation = (
            WD_ORIENT.LANDSCAPE
            if rectangle.width > rectangle.height
            else WD_ORIENT.PORTRAIT
        )

    def _configure_editable_section(self, section: Any, page: fitz.Page) -> None:
        self._configure_page_size(section, page.rect)
        blocks = page.get_text("dict", sort=True).get("blocks", [])
        content_rectangles = [
            fitz.Rect(block["bbox"])
            for block in blocks
            if block.get("bbox") and block.get("type") in {0, 1}
        ]
        if content_rectangles:
            left = min(rectangle.x0 for rectangle in content_rectangles)
            right = page.rect.width - max(
                rectangle.x1 for rectangle in content_rectangles
            )
            top = min(rectangle.y0 for rectangle in content_rectangles)
            bottom = page.rect.height - max(
                rectangle.y1 for rectangle in content_rectangles
            )
        else:
            left = right = top = bottom = 36
        section.left_margin = Pt(self._bounded_margin(left))
        section.right_margin = Pt(self._bounded_margin(right))
        section.top_margin = Pt(self._bounded_margin(top))
        section.bottom_margin = Pt(self._bounded_margin(bottom))
        section.header_distance = Pt(0)
        section.footer_distance = Pt(0)

    def _configure_visual_section(
        self,
        section: Any,
        rectangle: fitz.Rect,
    ) -> None:
        self._configure_page_size(section, rectangle)
        section.left_margin = Pt(0)
        section.right_margin = Pt(0)
        section.top_margin = Pt(0)
        section.bottom_margin = Pt(0)
        section.header_distance = Pt(0)
        section.footer_distance = Pt(0)

    @staticmethod
    def _bounded_margin(value: float) -> float:
        return min(54, max(24, value))

    def _append_page_content(
        self,
        document: DocumentType,
        page: fitz.Page,
    ) -> None:
        page_dictionary = page.get_text("dict", sort=True)
        blocks = page_dictionary.get("blocks", [])
        regular_size = self._regular_font_size(blocks)
        yellow_rectangles, border_rectangles = self._drawing_rectangles(page)
        table_entries, table_rectangles = self._table_entries(page)
        page_has_text = any(
            block.get("type") == 0
            and any(
                span.get("text", "").strip()
                for line in block.get("lines", [])
                for span in line.get("spans", [])
            )
            for block in blocks
        )
        seen_images: set[tuple[int, tuple[int, int, int, int]]] = set()

        entries: list[tuple[float, float, str, Any]] = list(table_entries)
        for block in blocks:
            block_rectangle = fitz.Rect(block.get("bbox", (0, 0, 0, 0)))
            if block.get("type") == 0 and any(
                rectangle.contains(block_rectangle)
                for rectangle in table_rectangles
            ):
                continue
            if block.get("type") == 1:
                if (
                    page_has_text
                    and block_rectangle.get_area()
                    >= page.rect.get_area() * 0.65
                ):
                    continue
                image_content = block.get("image")
                image_key = (
                    hash(image_content) if isinstance(image_content, bytes) else 0,
                    tuple(round(value) for value in block_rectangle),
                )
                if image_key in seen_images:
                    continue
                seen_images.add(image_key)
            entries.append(
                (
                    (
                        self._first_text_rectangle(block).y0
                        if block.get("type") == 0
                        else block_rectangle.y0
                    ),
                    (
                        self._first_text_rectangle(block).x0
                        if block.get("type") == 0
                        else block_rectangle.x0
                    ),
                    "image" if block.get("type") == 1 else "text",
                    block,
                )
            )

        for _top, _left, entry_type, payload in sorted(
            entries, key=lambda entry: entry[:2]
        ):
            if entry_type == "table":
                self._append_table(document, payload)
            elif entry_type == "image":
                self._append_image_block(document, page, payload)
            elif payload.get("type") == 0:
                self._append_text_block(
                    document,
                    page,
                    payload,
                    regular_size=regular_size,
                    yellow_rectangles=yellow_rectangles,
                    border_rectangles=border_rectangles,
                )

    @staticmethod
    def _first_text_rectangle(block: dict[str, Any]) -> fitz.Rect:
        for line in block.get("lines", []):
            if any(
                span.get("text", "").strip()
                for span in line.get("spans", [])
            ):
                return fitz.Rect(line["bbox"])
        return fitz.Rect(block.get("bbox", (0, 0, 0, 0)))

    @staticmethod
    def _regular_font_size(blocks: list[dict[str, Any]]) -> float:
        font_sizes = [
            float(span.get("size", 0))
            for block in blocks
            if block.get("type") == 0
            for line in block.get("lines", [])
            for span in line.get("spans", [])
            if span.get("text", "").strip()
        ]
        return statistics.median(font_sizes) if font_sizes else 11

    @staticmethod
    def _drawing_rectangles(
        page: fitz.Page,
    ) -> tuple[list[fitz.Rect], list[fitz.Rect]]:
        yellow_rectangles: list[fitz.Rect] = []
        border_rectangles: list[fitz.Rect] = []
        dark_segments: list[fitz.Rect] = []
        for drawing in page.get_drawings():
            drawing_rectangle = fitz.Rect(drawing.get("rect", (0, 0, 0, 0)))
            fill = drawing.get("fill")
            if (
                not drawing_rectangle.is_empty
                and fill
                and fill[0] >= 0.75
                and fill[1] >= 0.7
                and fill[2] <= 0.55
            ):
                # Highlights exported by office suites are often paths made of
                # curves and lines, not a PDF ``re`` rectangle.
                yellow_rectangles.append(drawing_rectangle)
                continue
            for item in drawing.get("items", []):
                if not item or item[0] != "re":
                    continue
                rectangle = fitz.Rect(item[1])
                if (
                    drawing.get("color") is not None
                    and rectangle.width < page.rect.width * 0.95
                    and rectangle.height < page.rect.height * 0.8
                ):
                    border_rectangles.append(rectangle)
                elif (
                    fill
                    and max(fill) <= 0.2
                    and min(rectangle.width, rectangle.height) <= 2
                ):
                    # Some producers flatten a border into many thin, filled
                    # black rectangles. Reassemble those segments below.
                    dark_segments.append(rectangle)
        border_rectangles.extend(
            PdfToDocxConverter._border_rectangles_from_segments(
                dark_segments,
                page.rect,
            )
        )
        return yellow_rectangles, border_rectangles

    @staticmethod
    def _border_rectangles_from_segments(
        segments: list[fitz.Rect],
        page_rectangle: fitz.Rect,
    ) -> list[fitz.Rect]:
        remaining = list(segments)
        candidates: list[fitz.Rect] = []
        while remaining:
            component = [remaining.pop()]
            changed = True
            while changed:
                changed = False
                for rectangle in list(remaining):
                    if any(
                        PdfToDocxConverter._rectangles_touch(
                            rectangle,
                            member,
                        )
                        for member in component
                    ):
                        component.append(rectangle)
                        remaining.remove(rectangle)
                        changed = True
            bounds = fitz.Rect(component[0])
            for rectangle in component[1:]:
                bounds |= rectangle
            horizontal = [
                rectangle
                for rectangle in component
                if rectangle.width >= bounds.width * 0.7
                and rectangle.height <= 2
            ]
            vertical = [
                rectangle
                for rectangle in component
                if rectangle.height > rectangle.width
                and rectangle.width <= 2
            ]
            has_left = any(
                abs(rectangle.x0 - bounds.x0) <= 2
                for rectangle in vertical
            )
            has_right = any(
                abs(rectangle.x1 - bounds.x1) <= 2
                for rectangle in vertical
            )
            if (
                bounds.width >= 50
                and bounds.height >= 10
                and bounds.width < page_rectangle.width * 0.95
                and bounds.height < page_rectangle.height * 0.8
                and len(horizontal) >= 2
                and has_left
                and has_right
            ):
                candidates.append(bounds)
        return candidates

    @staticmethod
    def _rectangles_touch(
        first: fitz.Rect,
        second: fitz.Rect,
        tolerance: float = 1,
    ) -> bool:
        expanded = fitz.Rect(
            first.x0 - tolerance,
            first.y0 - tolerance,
            first.x1 + tolerance,
            first.y1 + tolerance,
        )
        return expanded.intersects(second)

    @staticmethod
    def _table_entries(
        page: fitz.Page,
    ) -> tuple[list[tuple[float, float, str, Any]], list[fitz.Rect]]:
        try:
            tables = page.find_tables().tables
        except (AttributeError, RuntimeError, ValueError):
            return [], []
        entries = [
            (table.bbox[1], table.bbox[0], "table", table)
            for table in tables
        ]
        return entries, [fitz.Rect(table.bbox) for table in tables]

    @staticmethod
    def _append_table(document: DocumentType, detected_table: Any) -> None:
        cells = detected_table.extract()
        if not cells:
            return
        column_count = max((len(row) for row in cells), default=0)
        if column_count == 0:
            return
        table = document.add_table(rows=len(cells), cols=column_count)
        table.style = "Table Grid"
        for row_index, row in enumerate(cells):
            for column_index, value in enumerate(row):
                table.cell(row_index, column_index).text = value or ""

    def _append_image_block(
        self,
        document: DocumentType,
        page: fitz.Page,
        block: dict[str, Any],
    ) -> None:
        rectangle = fitz.Rect(block["bbox"])
        if rectangle.is_empty or rectangle.width <= 0 or rectangle.height <= 0:
            return
        try:
            rendered_image = self._render_image(page, block, rectangle)
            section = document.sections[-1]
            available_width = (
                section.page_width - section.left_margin - section.right_margin
            ) / 12700
            scale = min(1.0, available_width / rectangle.width)
            paragraph = document.add_paragraph()
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(2)
            paragraph.paragraph_format.keep_with_next = True
            if self._is_centered(rectangle, page.rect):
                paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                content_left = section.left_margin.pt
                paragraph.paragraph_format.left_indent = Pt(
                    max(0, rectangle.x0 - content_left)
                )
            paragraph.add_run().add_picture(
                io.BytesIO(rendered_image),
                width=Pt(rectangle.width * scale),
                height=Pt(rectangle.height * scale),
            )
        except Exception:
            LOGGER.warning(
                "DOCX image insertion failed; conversion continues with a placeholder",
                exc_info=True,
            )
            document.add_paragraph("[Image non convertible]")

    @classmethod
    def _render_image(
        cls,
        page: fitz.Page,
        block: dict[str, Any],
        rectangle: fitz.Rect,
    ) -> bytes:
        image = block.get("image")
        mask = block.get("mask")
        if isinstance(image, bytes):
            try:
                image_pixmap = cls._to_rgb(fitz.Pixmap(image))
                if isinstance(mask, bytes):
                    # PyMuPDF rejects Pixmap(color, mask) when ``color``
                    # already owns an alpha channel. PDF image blocks can
                    # expose both a decoded alpha channel and the original
                    # soft mask, notably in Firefox regression documents.
                    color_pixmap = cls._drop_alpha(image_pixmap)
                    mask_pixmap = cls._normalize_mask(fitz.Pixmap(mask))
                    image_pixmap = fitz.Pixmap(color_pixmap, mask_pixmap)
                return image_pixmap.tobytes("png")
            except Exception:
                LOGGER.warning(
                    "DOCX image extraction failed; rasterizing its page rectangle",
                    exc_info=True,
                )
        return cls._render_page_clip_on_white(page, rectangle)

    @staticmethod
    def _drop_alpha(pixmap: fitz.Pixmap) -> fitz.Pixmap:
        return fitz.Pixmap(pixmap, 0) if pixmap.alpha else pixmap

    @staticmethod
    def _to_rgb(pixmap: fitz.Pixmap) -> fitz.Pixmap:
        if pixmap.colorspace is None:
            raise ValueError("Une image couleur doit avoir un espace colorimétrique.")
        if pixmap.colorspace.n != 3:
            return fitz.Pixmap(fitz.csRGB, pixmap)
        return pixmap

    @staticmethod
    def _normalize_mask(pixmap: fitz.Pixmap) -> fitz.Pixmap:
        if pixmap.colorspace is not None and pixmap.colorspace.n != 1:
            pixmap = fitz.Pixmap(fitz.csGRAY, pixmap)
        return fitz.Pixmap(pixmap, 0) if pixmap.alpha else pixmap

    @staticmethod
    def _render_page_clip_on_white(
        page: fitz.Page,
        rectangle: fitz.Rect,
    ) -> bytes:
        # alpha=False composites transparency on white instead of black.
        return page.get_pixmap(
            matrix=fitz.Matrix(2, 2),
            clip=rectangle,
            alpha=False,
        ).tobytes("png")

    def _append_text_block(
        self,
        document: DocumentType,
        page: fitz.Page,
        block: dict[str, Any],
        *,
        regular_size: float,
        yellow_rectangles: list[fitz.Rect],
        border_rectangles: list[fitz.Rect],
    ) -> None:
        lines = [
            line
            for line in block.get("lines", [])
            if any(span.get("text", "").strip() for span in line.get("spans", []))
        ]
        if not lines:
            return
        line_groups = self._group_lines(lines, page.rect)
        for group_index, line_group in enumerate(line_groups):
            is_list = self._is_list_line(line_group[0])
            if is_list:
                self._append_list_lines(
                    document,
                    line_group,
                    yellow_rectangles=yellow_rectangles,
                    starts_list=(
                        group_index == 0
                        or not self._is_list_line(
                            line_groups[group_index - 1][0]
                        )
                    ),
                    ends_list=(
                        group_index == len(line_groups) - 1
                        or not self._is_list_line(
                            line_groups[group_index + 1][0]
                        )
                    ),
                )
                continue
            self._append_text_paragraph(
                document,
                page,
                line_group,
                regular_size=regular_size,
                yellow_rectangles=yellow_rectangles,
                border_rectangles=border_rectangles,
            )

    def _append_text_paragraph(
        self,
        document: DocumentType,
        page: fitz.Page,
        lines: list[dict[str, Any]],
        *,
        regular_size: float,
        yellow_rectangles: list[fitz.Rect],
        border_rectangles: list[fitz.Rect],
    ) -> None:
        block_rectangle = fitz.Rect(lines[0]["bbox"])
        for line in lines[1:]:
            block_rectangle |= fitz.Rect(line["bbox"])
        largest_size = max(
            float(span.get("size", 0))
            for line in lines
            for span in line.get("spans", [])
        )
        text_length = sum(
            len(span.get("text", ""))
            for line in lines
            for span in line.get("spans", [])
        )
        bold_ratio = self._bold_text_ratio(lines)
        is_wide = block_rectangle.width > page.rect.width * 0.6
        centered = (
            text_length <= 100
            and not is_wide
            and self._is_centered(block_rectangle, page.rect)
        )
        style = self._paragraph_style(
            largest_size,
            regular_size,
            centered=centered,
            text_length=text_length,
            bold_ratio=bold_ratio,
        )
        paragraph = document.add_paragraph(style=style)
        if centered:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif text_length >= 120 and is_wide:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        else:
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.paragraph_format.keep_together = style != "Normal"
        paragraph.paragraph_format.keep_with_next = style != "Normal"
        paragraph.paragraph_format.widow_control = True
        if style == "Title":
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(3)
            paragraph.paragraph_format.line_spacing = 1.04
        elif style.startswith("Heading"):
            paragraph.paragraph_format.space_before = Pt(4.5)
            paragraph.paragraph_format.space_after = Pt(2.5)
            paragraph.paragraph_format.line_spacing = 1.06
        else:
            paragraph.paragraph_format.space_before = Pt(0)
            paragraph.paragraph_format.space_after = Pt(2)
            paragraph.paragraph_format.line_spacing = (
                1.14 if text_length >= 120 else 1.1
            )

        previous_text = ""
        for line_index, line in enumerate(lines):
            spans = line.get("spans", [])
            if line_index:
                separator = "" if previous_text.rstrip().endswith("-") else " "
                if separator:
                    paragraph.add_run(separator)
            for span in spans:
                text = str(span.get("text", ""))
                self._append_styled_run(
                    paragraph,
                    span,
                    text,
                    highlighted=self._is_highlighted(
                        fitz.Rect(span.get("bbox", block_rectangle)),
                        yellow_rectangles,
                    ),
                )
                previous_text = text

        if any(
            self._rectangle_frames_block(rectangle, block_rectangle)
            for rectangle in border_rectangles
        ):
            self._add_paragraph_border(paragraph)

    @staticmethod
    def _bold_text_ratio(lines: list[dict[str, Any]]) -> float:
        bold_characters = 0
        total_characters = 0
        for line in lines:
            for span in line.get("spans", []):
                text = str(span.get("text", "")).strip()
                if not text:
                    continue
                character_count = len(text)
                total_characters += character_count
                flags = int(span.get("flags", 0))
                font_name = str(span.get("font", "")).lower()
                if bool(flags & 16) or "bold" in font_name:
                    bold_characters += character_count
        return (
            bold_characters / total_characters
            if total_characters
            else 0
        )

    @classmethod
    def _group_lines(
        cls,
        lines: list[dict[str, Any]],
        page_rectangle: fitz.Rect,
    ) -> list[list[dict[str, Any]]]:
        groups: list[list[dict[str, Any]]] = []
        current_group: list[dict[str, Any]] = []
        for line in lines:
            if cls._is_list_line(line):
                if current_group:
                    groups.append(current_group)
                current_group = [line]
                continue
            if current_group and cls._line_starts_new_paragraph(
                current_group[-1],
                line,
                page_rectangle,
            ):
                groups.append(current_group)
                current_group = []
            current_group.append(line)
        if current_group:
            groups.append(current_group)
        return groups

    @staticmethod
    def _is_list_line(line: dict[str, Any]) -> bool:
        text = "".join(
            str(span.get("text", "")) for span in line.get("spans", [])
        )
        return LIST_MARKER.match(text) is not None

    @staticmethod
    def _line_starts_new_paragraph(
        previous_line: dict[str, Any],
        current_line: dict[str, Any],
        page_rectangle: fitz.Rect,
    ) -> bool:
        previous_rectangle = fitz.Rect(previous_line["bbox"])
        current_rectangle = fitz.Rect(current_line["bbox"])
        vertical_gap = current_rectangle.y0 - previous_rectangle.y1
        line_height = min(
            previous_rectangle.height,
            current_rectangle.height,
        )
        previous_sizes = [
            float(span.get("size", 0))
            for span in previous_line.get("spans", [])
            if span.get("text", "").strip()
        ]
        current_sizes = [
            float(span.get("size", 0))
            for span in current_line.get("spans", [])
            if span.get("text", "").strip()
        ]
        previous_size = max(previous_sizes, default=0)
        current_size = max(current_sizes, default=0)
        size_changed = (
            min(previous_size, current_size) > 0
            and max(previous_size, current_size)
            / min(previous_size, current_size)
            >= 1.3
        )
        distinct_centered_lines = (
            PdfToDocxConverter._line_is_short_centered(
                previous_line,
                page_rectangle,
            )
            and PdfToDocxConverter._line_is_short_centered(
                current_line,
                page_rectangle,
            )
        )
        return (
            vertical_gap > max(4, line_height * 0.45)
            or size_changed
            or distinct_centered_lines
        )

    @staticmethod
    def _line_is_short_centered(
        line: dict[str, Any],
        page_rectangle: fitz.Rect,
    ) -> bool:
        text = "".join(
            str(span.get("text", "")) for span in line.get("spans", [])
        ).strip()
        rectangle = fitz.Rect(line["bbox"])
        return (
            bool(text)
            and len(text) <= 100
            and rectangle.width <= page_rectangle.width * 0.6
            and PdfToDocxConverter._is_centered(rectangle, page_rectangle)
        )

    def _append_list_lines(
        self,
        document: DocumentType,
        lines: list[dict[str, Any]],
        *,
        yellow_rectangles: list[fitz.Rect],
        starts_list: bool,
        ends_list: bool,
    ) -> None:
        line = lines[0]
        spans = line.get("spans", [])
        text = "".join(str(span.get("text", "")) for span in spans)
        marker = LIST_MARKER.match(text)
        if marker is None:
            return
        item_text = text[marker.end() :].strip()
        continuation_text = " ".join(
            "".join(
                str(span.get("text", ""))
                for span in continuation.get("spans", [])
            ).strip()
            for continuation in lines[1:]
        ).strip()
        if not item_text and not continuation_text:
            return
        numbered = marker.group("marker")[0].isdigit()
        paragraph = document.add_paragraph(
            style="List Number" if numbered else "List Bullet"
        )
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.paragraph_format.left_indent = Pt(18)
        paragraph.paragraph_format.first_line_indent = Pt(-12)
        paragraph.paragraph_format.space_before = Pt(2.5 if starts_list else 0)
        paragraph.paragraph_format.space_after = Pt(4 if ends_list else 0.75)
        paragraph.paragraph_format.line_spacing = 1.08
        paragraph.paragraph_format.keep_together = False
        paragraph.paragraph_format.widow_control = True
        remaining_prefix = marker.end()
        consumed = 0
        for span in spans:
            span_text = str(span.get("text", ""))
            start = max(0, remaining_prefix - consumed)
            rendered_text = span_text[start:]
            consumed += len(span_text)
            if not rendered_text:
                continue
            self._append_styled_run(
                paragraph,
                span,
                rendered_text,
                highlighted=self._is_highlighted(
                    fitz.Rect(span.get("bbox", (0, 0, 0, 0))),
                    yellow_rectangles,
                ),
            )
        for continuation in lines[1:]:
            paragraph.add_run(" ")
            for span in continuation.get("spans", []):
                self._append_styled_run(
                    paragraph,
                    span,
                    str(span.get("text", "")),
                    highlighted=self._is_highlighted(
                        fitz.Rect(span.get("bbox", (0, 0, 0, 0))),
                        yellow_rectangles,
                    ),
                )

    @staticmethod
    def _paragraph_style(
        largest_size: float,
        regular_size: float,
        *,
        centered: bool,
        text_length: int,
        bold_ratio: float,
    ) -> str:
        if (
            centered
            and text_length < 100
            and largest_size >= regular_size * 1.25
        ):
            return "Title"
        if text_length < 160 and largest_size >= max(18, regular_size * 1.55):
            return "Title" if centered else "Heading 1"
        if text_length < 180 and largest_size >= max(13.5, regular_size * 1.22):
            return "Heading 2"
        if (
            not centered
            and text_length <= 110
            and bold_ratio >= 0.8
        ):
            return "Heading 2"
        return "Normal"

    @staticmethod
    def _append_styled_run(
        paragraph: Any,
        span: dict[str, Any],
        text: str,
        *,
        highlighted: bool,
    ) -> None:
        run = paragraph.add_run(text)
        flags = int(span.get("flags", 0))
        font_name = str(span.get("font", "Arial")).split("+")[-1]
        run.bold = bool(flags & 16) or "bold" in font_name.lower()
        run.italic = bool(flags & 2) or any(
            marker in font_name.lower() for marker in ("italic", "oblique")
        )
        run.font.name = font_name
        run.font.size = Pt(min(40, max(6, float(span.get("size", 11)))))
        color = int(span.get("color", 0))
        run.font.color.rgb = RGBColor(
            (color >> 16) & 0xFF,
            (color >> 8) & 0xFF,
            color & 0xFF,
        )
        if highlighted:
            run.font.highlight_color = WD_COLOR_INDEX.YELLOW

    @staticmethod
    def _is_centered(rectangle: fitz.Rect, page_rectangle: fitz.Rect) -> bool:
        return (
            abs(
                (rectangle.x0 + rectangle.x1) / 2
                - (page_rectangle.x0 + page_rectangle.x1) / 2
            )
            <= 22
            and rectangle.width <= page_rectangle.width * 0.9
        )

    @staticmethod
    def _is_highlighted(
        span_rectangle: fitz.Rect,
        yellow_rectangles: list[fitz.Rect],
    ) -> bool:
        return any(
            rectangle.intersects(span_rectangle)
            and (rectangle & span_rectangle).get_area()
            >= span_rectangle.get_area() * 0.35
            for rectangle in yellow_rectangles
            if span_rectangle.get_area() > 0
        )

    @staticmethod
    def _rectangle_frames_block(
        rectangle: fitz.Rect,
        block_rectangle: fitz.Rect,
    ) -> bool:
        tolerance = 2
        return (
            rectangle.x0 <= block_rectangle.x0 + tolerance
            and rectangle.y0 <= block_rectangle.y0 + tolerance
            and rectangle.x1 >= block_rectangle.x1 - tolerance
            and rectangle.y1 >= block_rectangle.y1 - tolerance
            and rectangle.width <= block_rectangle.width + 80
            and rectangle.height <= block_rectangle.height + 100
        )

    @staticmethod
    def _add_paragraph_border(paragraph: Any) -> None:
        paragraph.paragraph_format.space_before = Pt(4)
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.line_spacing = 1.12
        paragraph_properties = paragraph._p.get_or_add_pPr()
        borders = paragraph_properties.find(qn("w:pBdr"))
        if borders is None:
            borders = OxmlElement("w:pBdr")
            paragraph_properties.append(borders)
        for edge_name in ("top", "left", "bottom", "right"):
            edge = OxmlElement(f"w:{edge_name}")
            edge.set(qn("w:val"), "single")
            edge.set(qn("w:sz"), "8")
            edge.set(qn("w:space"), "8")
            edge.set(qn("w:color"), "333333")
            borders.append(edge)

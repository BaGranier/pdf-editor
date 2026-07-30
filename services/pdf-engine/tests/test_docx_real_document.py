from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import fitz
import pytest
from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

from app.conversion.docx_converter import (
    PdfToDocxConverter,
    text_retention_ratio,
)
from app.conversion.models import DocxMode


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_REAL_PDF = (
    PROJECT_ROOT
    / "data"
    / "input"
    / "manual-docx-regression"
    / "2-ENGAGEMENT_INDIVIDUEL_ETUDIANT_2026-2027.pdf"
)
RESULT_PATH = (
    PROJECT_ROOT
    / "apps"
    / "web"
    / "test-results"
    / "docx-editable-real-document"
    / "results.json"
)
EXPECTED_TEXTS = (
    "Engagement individuel",
    "Nom de l’étudiant",
    "Comportement général",
    "Rappel de la législation française",
)
EXPECTED_SUBTITLE = "Exemplaire à remettre signé à l’administration"

pytestmark = [
    pytest.mark.docx_real_document,
    pytest.mark.regression,
]


def real_pdf_path() -> Path:
    configured = os.environ.get("QA_REAL_DOCX_PDF")
    if not configured:
        return DEFAULT_REAL_PDF
    candidate = Path(configured)
    return candidate if candidate.is_absolute() else PROJECT_ROOT / candidate


def normalized(value: str) -> str:
    return " ".join(
        value.casefold().replace("’", "'").replace("\u00a0", " ").split()
    )


def black_pixel_ratio(image: bytes) -> float:
    pixmap = fitz.Pixmap(image)
    if pixmap.colorspace is None:
        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
    samples = memoryview(pixmap.samples)
    channel_count = pixmap.n
    color_channels = channel_count - int(pixmap.alpha)
    pixel_count = pixmap.width * pixmap.height
    sample_step = max(1, pixel_count // 50_000)
    visible = 0
    black = 0
    for pixel_index in range(0, pixel_count, sample_step):
        offset = pixel_index * channel_count
        if pixmap.alpha and samples[offset + color_channels] <= 20:
            continue
        visible += 1
        if all(samples[offset + channel] <= 32 for channel in range(color_channels)):
            black += 1
    return black / visible if visible else 0.0


def section_word_counts(document: Document) -> list[int]:
    counts: list[int] = []
    current_count = 0
    for element in document.element.body.iterchildren():
        text = " ".join(
            node.text or ""
            for node in element.xpath(".//w:t")
        )
        current_count += len(text.split())
        if (
            element.tag == qn("w:p")
            and element.xpath("./w:pPr/w:sectPr")
        ):
            counts.append(current_count)
            current_count = 0
    counts.append(current_count)
    return counts


def libreoffice_page_metrics(
    docx_path: Path,
    temporary_directory: Path,
) -> tuple[int | None, list[int], str | None]:
    executable = shutil.which("libreoffice")
    if executable is None:
        return None, [], "LibreOffice indisponible"
    profile = temporary_directory / "libreoffice-profile"
    cache = temporary_directory / "xdg-cache"
    config = temporary_directory / "xdg-config"
    runtime = temporary_directory / "xdg-runtime"
    for directory in (cache, config, runtime):
        directory.mkdir(mode=0o700)
    environment = {
        **os.environ,
        "XDG_CACHE_HOME": str(cache),
        "XDG_CONFIG_HOME": str(config),
        "XDG_RUNTIME_DIR": str(runtime),
    }
    try:
        completed = subprocess.run(
            [
                executable,
                "--headless",
                f"-env:UserInstallation={profile.as_uri()}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(temporary_directory),
                str(docx_path),
            ],
            check=False,
            capture_output=True,
            text=True,
            timeout=60,
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None, [], "Rendu LibreOffice indisponible dans cet environnement"
    rendered_pdf = temporary_directory / f"{docx_path.stem}.pdf"
    if completed.returncode != 0 or not rendered_pdf.is_file():
        return None, [], "Rendu LibreOffice bloqué dans cet environnement"
    with fitz.open(rendered_pdf) as rendered:
        page_word_counts = [
            len(page.get_text("words"))
            for page in rendered
        ]
        return len(rendered), page_word_counts, None


def test_real_pdf_produces_an_editable_docx(tmp_path: Path) -> None:
    source_path = real_pdf_path()
    if not source_path.is_file():
        pytest.skip(
            "PDF réel absent. Définissez QA_REAL_DOCX_PDF pour activer ce test."
        )

    output_path = tmp_path / "editable.docx"
    artifact = PdfToDocxConverter().convert(
        source_path,
        output_path,
        mode=DocxMode.EDITABLE,
    )
    document = Document(output_path)
    with fitz.open(source_path) as source:
        source_page_count = len(source)
        source_text = "\n".join(
            page.get_text("text", sort=True) for page in source
        )
    docx_text = "\n".join(
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
    retention_ratio = text_retention_ratio(source_text, docx_text)
    meaningful_paragraphs = [
        paragraph
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    ]
    list_count = sum(
        paragraph.style.name in {"List Bullet", "List Number"}
        for paragraph in meaningful_paragraphs
    )
    highlight_present = any(
        run.font.highlight_color == WD_COLOR_INDEX.YELLOW
        for paragraph in meaningful_paragraphs
        if "nom de l" in normalized(paragraph.text)
        for run in paragraph.runs
    )
    border_present = any(
        paragraph._p.xpath(".//w:pBdr")
        for paragraph in meaningful_paragraphs
    ) or bool(document.tables)
    image_parts = [
        part
        for part in document.part.package.parts
        if part.content_type.startswith("image/")
    ]
    black_pixel_ratios = [
        black_pixel_ratio(part.blob)
        for part in image_parts
    ]
    logo_background_acceptable = (
        bool(black_pixel_ratios) and min(black_pixel_ratios) < 0.15
    )
    normalized_docx_text = normalized(docx_text)
    title_presence = {
        expected: normalized(expected) in normalized_docx_text
        for expected in EXPECTED_TEXTS
    }
    centered_paragraphs = [
        paragraph
        for paragraph in meaningful_paragraphs
        if paragraph.alignment == WD_ALIGN_PARAGRAPH.CENTER
    ]
    long_centered_paragraphs = [
        paragraph
        for paragraph in centered_paragraphs
        if len(paragraph.text.split()) >= 12
    ]
    fully_bold_paragraphs = []
    mixed_bold_paragraphs = []
    for paragraph in meaningful_paragraphs:
        text_runs = [run for run in paragraph.runs if run.text.strip()]
        if text_runs and all(run.bold is True for run in text_runs):
            fully_bold_paragraphs.append(paragraph)
        if (
            any(run.bold is True for run in text_runs)
            and any(run.bold is False for run in text_runs)
        ):
            mixed_bold_paragraphs.append(paragraph)
    empty_bullets = [
        paragraph
        for paragraph in document.paragraphs
        if paragraph.style.name in {"List Bullet", "List Number"}
        and not paragraph.text.strip()
    ]
    title_paragraphs = [
        paragraph
        for paragraph in meaningful_paragraphs
        if normalized(paragraph.text) == normalized("Engagement individuel")
    ]
    subtitle_paragraphs = [
        paragraph
        for paragraph in meaningful_paragraphs
        if normalized(paragraph.text) == normalized(EXPECTED_SUBTITLE)
    ]
    drawing_paragraph_indexes = [
        index
        for index, paragraph in enumerate(document.paragraphs)
        if paragraph._p.xpath(".//w:drawing")
    ]
    title_paragraph_index = next(
        (
            index
            for index, paragraph in enumerate(document.paragraphs)
            if normalized(paragraph.text) == normalized("Engagement individuel")
        ),
        None,
    )
    structural_page_word_counts = section_word_counts(document)
    structural_quasi_empty_pages = sum(
        word_count < 15
        for word_count in structural_page_word_counts
    )
    rendered_page_count, rendered_page_word_counts, render_reason = (
        libreoffice_page_metrics(output_path, tmp_path)
    )
    rendered_quasi_empty_pages = sum(
        word_count < 15
        for word_count in rendered_page_word_counts
    )
    explicit_page_breaks = len(
        document.element.xpath(".//w:br[@w:type='page']")
    )
    checks = {
        "openable": output_path.stat().st_size > 0,
        "editableText": len(docx_text.split()) >= 100,
        "retention": retention_ratio >= 0.95,
        "paragraphCount": len(meaningful_paragraphs) >= 30,
        "notImageOnly": len(meaningful_paragraphs) > len(document.inline_shapes),
        "reasonableImages": (
            1 <= len(document.inline_shapes) <= source_page_count * 4
        ),
        "logoBackground": logo_background_acceptable,
        "reasonablePagination": len(document.sections) == source_page_count,
        "titles": all(title_presence.values()),
        "titleAndSubtitleSeparated": (
            bool(title_paragraphs) and bool(subtitle_paragraphs)
        ),
        "logoBeforeTitle": (
            bool(drawing_paragraph_indexes)
            and title_paragraph_index is not None
            and drawing_paragraph_indexes[0] < title_paragraph_index
        ),
        "lists": list_count > 0,
        "emptyBullets": len(empty_bullets) == 0,
        "longCenteredParagraphs": len(long_centered_paragraphs) == 0,
        "mixedBoldRuns": len(mixed_bold_paragraphs) > 0,
        "structuralQuasiEmptyPages": structural_quasi_empty_pages == 0,
        "pageInflation": len(document.sections) <= source_page_count + 1,
        "explicitPageBreaks": explicit_page_breaks <= source_page_count - 1,
        "renderedPageInflation": (
            rendered_page_count is None
            or rendered_page_count <= source_page_count + 1
        ),
        "renderedQuasiEmptyPages": (
            rendered_page_count is None
            or rendered_quasi_empty_pages == 0
        ),
        "highlight": highlight_present,
        "border": border_present,
    }
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(
        json.dumps(
            {
                "file": source_path.name,
                "docxMode": "editable",
                "sourcePageCount": source_page_count,
                "sourceTextCharacters": len(source_text),
                "docxTextCharacters": len(docx_text),
                "textRetentionRatio": round(retention_ratio, 4),
                "paragraphCount": len(meaningful_paragraphs),
                "editableWordCount": len(docx_text.split()),
                "imageCount": len(document.inline_shapes),
                "logoPresent": len(document.inline_shapes) > 0,
                "logoBackgroundAcceptable": logo_background_acceptable,
                "imageBlackPixelRatios": [
                    round(ratio, 4) for ratio in black_pixel_ratios
                ],
                "docxSectionCount": len(document.sections),
                "titlePresence": title_presence,
                "listCount": list_count,
                "centeredParagraphCount": len(centered_paragraphs),
                "longCenteredParagraphCount": len(long_centered_paragraphs),
                "fullyBoldParagraphCount": len(fully_bold_paragraphs),
                "mixedBoldParagraphCount": len(mixed_bold_paragraphs),
                "emptyBulletCount": len(empty_bullets),
                "structuralPageWordCounts": structural_page_word_counts,
                "estimatedPageCount": len(document.sections),
                "renderedPageCount": rendered_page_count,
                "renderedPageWordCounts": rendered_page_word_counts,
                "quasiEmptyPageCount": (
                    rendered_quasi_empty_pages
                    if rendered_page_count is not None
                    else structural_quasi_empty_pages
                ),
                "explicitPageBreakCount": explicit_page_breaks,
                "pageMeasurement": (
                    "libreoffice"
                    if rendered_page_count is not None
                    else "sections-docx"
                ),
                "renderWarning": render_reason,
                "highlightPresent": highlight_present,
                "borderPresent": border_present,
                "warnings": list(artifact.warnings),
                "status": "passed" if all(checks.values()) else "failed",
                "checks": checks,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    assert all(checks.values()), checks

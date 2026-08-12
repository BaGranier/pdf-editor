from __future__ import annotations

import statistics
from dataclasses import dataclass
from typing import Any, Sequence

import fitz

from app.conversion.header_footer import StoryType, TextOrigin


@dataclass(frozen=True)
class LogicalLine:
    """A visual text line reconstructed from one or more PDF fragments."""

    fragments: tuple[dict[str, Any], ...]
    bbox: tuple[float, float, float, float]
    baseline: float
    text: str
    spans: tuple[dict[str, Any], ...]
    dominant_font_size: float
    source_block_indexes: tuple[int, ...]
    page_index: int
    origin: TextOrigin
    story_type: StoryType
    classification_confidence: float

    def __getitem__(self, key: str) -> Any:
        if key == "bbox":
            return self.bbox
        if key == "spans":
            return self.spans
        raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except KeyError:
            return default


@dataclass(frozen=True)
class CanonicalizedLines:
    lines: tuple[LogicalLine, ...]
    raw_fragment_count: int
    same_baseline_fragments_merged: int


@dataclass(frozen=True)
class _LineFragment:
    source: dict[str, Any]
    bbox: fitz.Rect
    baseline: float
    dominant_font_size: float
    source_block_index: int
    page_index: int
    origin: TextOrigin
    story_type: StoryType
    classification_confidence: float


def canonicalize_visual_lines(
    raw_lines: Sequence[dict[str, Any]],
    page_width: float,
    *,
    origin: TextOrigin = "native",
) -> CanonicalizedLines:
    """Merge PyMuPDF pseudo-lines that describe one visual baseline.

    PyMuPDF usually returns visual lines, but some PDFs expose words, bullets,
    or styled fragments as separate ``line`` dictionaries. Paragraph analysis
    must not see those implementation details as independent lines.
    """

    fragments = tuple(
        fragment
        for raw_line in raw_lines
        if (fragment := _make_fragment(raw_line)) is not None
    )
    if not fragments:
        return CanonicalizedLines((), 0, 0)

    baseline_groups: list[list[_LineFragment]] = []
    for fragment in sorted(
        fragments,
        key=lambda item: (item.baseline, item.bbox.y0, item.bbox.x0),
    ):
        matching_group = next(
            (
                group
                for group in reversed(baseline_groups)
                if _same_visual_baseline(group, fragment, origin=origin)
            ),
            None,
        )
        if matching_group is None:
            baseline_groups.append([fragment])
        else:
            matching_group.append(fragment)

    logical_lines: list[LogicalLine] = []
    merged_count = 0
    for baseline_group in baseline_groups:
        for horizontal_group in _split_horizontal_runs(
            baseline_group,
            page_width,
        ):
            logical_lines.append(_build_logical_line(horizontal_group))
            merged_count += len(horizontal_group) - 1

    logical_lines.sort(key=lambda line: (line.baseline, line.bbox[0]))
    return CanonicalizedLines(
        lines=tuple(logical_lines),
        raw_fragment_count=len(fragments),
        same_baseline_fragments_merged=merged_count,
    )


def ensure_logical_lines(
    lines: Sequence[LogicalLine | dict[str, Any]],
    page_width: float,
    *,
    origin: TextOrigin = "native",
) -> CanonicalizedLines:
    if all(isinstance(line, LogicalLine) for line in lines):
        logical_lines = tuple(
            line for line in lines if isinstance(line, LogicalLine)
        )
        return CanonicalizedLines(
            lines=logical_lines,
            raw_fragment_count=sum(len(line.fragments) for line in logical_lines),
            same_baseline_fragments_merged=sum(
                max(0, len(line.fragments) - 1) for line in logical_lines
            ),
        )
    return canonicalize_visual_lines(
        [line for line in lines if isinstance(line, dict)],
        page_width,
        origin=origin,
    )


def _make_fragment(raw_line: dict[str, Any]) -> _LineFragment | None:
    spans = [
        span
        for span in raw_line.get("spans", [])
        if str(span.get("text", "")).strip()
    ]
    if not spans or not raw_line.get("bbox"):
        return None
    rectangle = fitz.Rect(raw_line["bbox"])
    font_sizes = [
        float(span.get("size", 0))
        for span in spans
        if float(span.get("size", 0)) > 0
    ]
    return _LineFragment(
        source=raw_line,
        bbox=rectangle,
        baseline=_span_baseline(spans, rectangle),
        dominant_font_size=statistics.median(font_sizes) if font_sizes else 11,
        source_block_index=int(raw_line.get("_source_block_index", -1)),
        page_index=int(raw_line.get("_page_index", -1)),
        origin=raw_line.get("_origin", "native"),
        story_type=raw_line.get("_story_type", "body"),
        classification_confidence=float(raw_line.get("_story_confidence", 0)),
    )


def _same_visual_baseline(
    group: Sequence[_LineFragment],
    candidate: _LineFragment,
    *,
    origin: TextOrigin,
) -> bool:
    group_baseline = statistics.median(fragment.baseline for fragment in group)
    group_size = statistics.median(
        fragment.dominant_font_size for fragment in group
    )
    tolerance = max(0.75, max(group_size, candidate.dominant_font_size) * 0.08)
    if origin == "ocr":
        tolerance *= 1.5
    if abs(candidate.baseline - group_baseline) > tolerance:
        return False

    size_ratio = max(group_size, candidate.dominant_font_size) / max(
        0.1,
        min(group_size, candidate.dominant_font_size),
    )
    if size_ratio > (1.35 if origin == "ocr" else 1.25):
        return False

    return any(
        _vertical_overlap_ratio(fragment.bbox, candidate.bbox)
        >= (0.5 if origin == "ocr" else 0.65)
        for fragment in group
    )


def _split_horizontal_runs(
    fragments: Sequence[_LineFragment],
    page_width: float,
) -> tuple[tuple[_LineFragment, ...], ...]:
    groups: list[list[_LineFragment]] = []
    for fragment in sorted(fragments, key=lambda item: item.bbox.x0):
        if not groups:
            groups.append([fragment])
            continue
        current = groups[-1]
        right_edge = max(item.bbox.x1 for item in current)
        font_size = statistics.median(
            item.dominant_font_size for item in (*current, fragment)
        )
        horizontal_gap = fragment.bbox.x0 - right_edge
        maximum_gap = max(font_size * 3, page_width * 0.04)
        overlap_tolerance = max(1, font_size * 0.12)
        if horizontal_gap > maximum_gap or horizontal_gap < -overlap_tolerance:
            groups.append([fragment])
        else:
            current.append(fragment)
    return tuple(tuple(group) for group in groups)


def _build_logical_line(fragments: Sequence[_LineFragment]) -> LogicalLine:
    ordered_fragments = tuple(sorted(fragments, key=lambda item: item.bbox.x0))
    rectangle = fitz.Rect(ordered_fragments[0].bbox)
    for fragment in ordered_fragments[1:]:
        rectangle |= fragment.bbox

    ordered_spans = sorted(
        (
            dict(span)
            for fragment in ordered_fragments
            for span in fragment.source.get("spans", [])
            if str(span.get("text", "")).strip()
        ),
        key=lambda span: fitz.Rect(span.get("bbox", rectangle)).x0,
    )
    reconstructed_spans: list[dict[str, Any]] = []
    for span in ordered_spans:
        if reconstructed_spans and _needs_reconstructed_space(
            reconstructed_spans[-1],
            span,
        ):
            span["text"] = f" {span.get('text', '')}"
        reconstructed_spans.append(span)

    font_sizes = [fragment.dominant_font_size for fragment in ordered_fragments]
    source_indexes = tuple(
        sorted(
            {
                fragment.source_block_index
                for fragment in ordered_fragments
                if fragment.source_block_index >= 0
            }
        )
    )
    return LogicalLine(
        fragments=tuple(fragment.source for fragment in ordered_fragments),
        bbox=(rectangle.x0, rectangle.y0, rectangle.x1, rectangle.y1),
        baseline=statistics.median(
            fragment.baseline for fragment in ordered_fragments
        ),
        text="".join(str(span.get("text", "")) for span in reconstructed_spans),
        spans=tuple(reconstructed_spans),
        dominant_font_size=statistics.median(font_sizes),
        source_block_indexes=source_indexes,
        page_index=ordered_fragments[0].page_index,
        origin=ordered_fragments[0].origin,
        story_type=ordered_fragments[0].story_type,
        classification_confidence=min(
            fragment.classification_confidence
            for fragment in ordered_fragments
        ),
    )


def _needs_reconstructed_space(
    previous_span: dict[str, Any],
    current_span: dict[str, Any],
) -> bool:
    previous_text = str(previous_span.get("text", ""))
    current_text = str(current_span.get("text", ""))
    if not previous_text or not current_text:
        return False
    if previous_text[-1].isspace() or current_text[0].isspace():
        return False
    if current_text[0] in ",.;:!?%)]}»":
        return False
    if previous_text[-1] in "([{'’\"«/":
        return False

    previous_rectangle = fitz.Rect(previous_span.get("bbox", (0, 0, 0, 0)))
    current_rectangle = fitz.Rect(current_span.get("bbox", (0, 0, 0, 0)))
    font_size = statistics.median(
        (
            float(previous_span.get("size", 11)),
            float(current_span.get("size", 11)),
        )
    )
    return current_rectangle.x0 - previous_rectangle.x1 >= max(
        0.5,
        font_size * 0.12,
    )


def _span_baseline(spans: Sequence[dict[str, Any]], rectangle: fitz.Rect) -> float:
    origins = [
        float(span["origin"][1])
        for span in spans
        if span.get("origin") and len(span["origin"]) >= 2
    ]
    return statistics.median(origins) if origins else rectangle.y1 - rectangle.height * 0.2


def _vertical_overlap_ratio(first: fitz.Rect, second: fitz.Rect) -> float:
    overlap = max(0, min(first.y1, second.y1) - max(first.y0, second.y0))
    return overlap / max(0.1, min(first.height, second.height))

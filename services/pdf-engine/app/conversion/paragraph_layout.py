from __future__ import annotations

import re
import statistics
from dataclasses import dataclass
from typing import Any, Literal, Sequence

import fitz

from app.conversion.header_footer import TextOrigin
from app.conversion.logical_lines import LogicalLine, ensure_logical_lines


LIST_MARKER = re.compile(
    r"^\s*(?P<marker>[-–—•▪‣●○\uf0b7]|\d+[.)])\s+"
)

ParagraphAlignment = Literal["left", "center", "right", "justify"]


@dataclass(frozen=True)
class ParagraphLayout:
    lines: tuple[LogicalLine, ...]
    bbox: tuple[float, float, float, float]
    left_edge: float
    right_edge: float
    first_line_left: float
    dominant_font_size: float
    alignment: ParagraphAlignment
    source_line_spacing_ratio: float
    line_spacing_ratio: float
    space_before: float
    space_after: float
    first_line_indent: float
    left_indent: float
    right_indent: float


def analyze_paragraph_layouts(
    lines: Sequence[LogicalLine | dict[str, Any]],
    page_rectangle: fitz.Rect,
    content_rectangle: fitz.Rect,
    *,
    origin: TextOrigin = "native",
) -> tuple[ParagraphLayout, ...]:
    logical_lines = ensure_logical_lines(
        lines,
        page_rectangle.width,
        origin=origin,
    ).lines
    groups = group_paragraph_lines(
        logical_lines,
        page_rectangle,
        origin=origin,
    )
    if not groups:
        return ()

    geometries = [
        _analyze_group(
            group,
            page_rectangle,
            content_rectangle,
            origin=origin,
        )
        for group in groups
    ]
    layouts: list[ParagraphLayout] = []
    for index, geometry in enumerate(geometries):
        next_geometry = geometries[index + 1] if index + 1 < len(geometries) else None
        space_after = _paragraph_space_after(geometry, next_geometry)
        layouts.append(
            ParagraphLayout(
                lines=geometry.lines,
                bbox=geometry.bbox,
                left_edge=geometry.left_edge,
                right_edge=geometry.right_edge,
                first_line_left=geometry.first_line_left,
                dominant_font_size=geometry.dominant_font_size,
                alignment=geometry.alignment,
                source_line_spacing_ratio=geometry.source_line_spacing_ratio,
                line_spacing_ratio=geometry.line_spacing_ratio,
                space_before=0,
                space_after=space_after,
                first_line_indent=geometry.first_line_indent,
                left_indent=geometry.left_indent,
                right_indent=geometry.right_indent,
            )
        )
    return tuple(layouts)


def group_paragraph_lines(
    lines: Sequence[LogicalLine | dict[str, Any]],
    page_rectangle: fitz.Rect,
    *,
    origin: TextOrigin = "native",
) -> tuple[tuple[LogicalLine, ...], ...]:
    logical_lines = ensure_logical_lines(
        lines,
        page_rectangle.width,
        origin=origin,
    ).lines
    groups: list[list[LogicalLine]] = []
    current_group: list[LogicalLine] = []
    for line in logical_lines:
        if is_list_line(line):
            if current_group:
                groups.append(current_group)
            current_group = [line]
            continue
        if current_group and _starts_new_paragraph(
            current_group,
            line,
            page_rectangle,
            origin=origin,
        ):
            groups.append(current_group)
            current_group = []
        current_group.append(line)
    if current_group:
        groups.append(current_group)
    return tuple(tuple(group) for group in groups)


def is_list_line(line: LogicalLine | dict[str, Any]) -> bool:
    return LIST_MARKER.match(_line_text(line)) is not None


@dataclass(frozen=True)
class _ParagraphGeometry:
    lines: tuple[LogicalLine, ...]
    bbox: tuple[float, float, float, float]
    left_edge: float
    right_edge: float
    first_line_left: float
    dominant_font_size: float
    alignment: ParagraphAlignment
    source_line_spacing_ratio: float
    line_spacing_ratio: float
    first_line_indent: float
    left_indent: float
    right_indent: float
    median_internal_bbox_gap: float


def _starts_new_paragraph(
    current_group: Sequence[LogicalLine],
    current_line: LogicalLine,
    page_rectangle: fitz.Rect,
    *,
    origin: TextOrigin,
) -> bool:
    previous_line = current_group[-1]
    previous_rectangle = fitz.Rect(previous_line["bbox"])
    current_rectangle = fitz.Rect(current_line["bbox"])
    if current_rectangle.y0 <= previous_rectangle.y0:
        return True

    previous_size = _dominant_font_size((previous_line,))
    current_size = _dominant_font_size((current_line,))
    dominant_size = statistics.median((previous_size, current_size))
    size_ratio = (
        max(previous_size, current_size) / min(previous_size, current_size)
        if min(previous_size, current_size) > 0
        else 1
    )
    if size_ratio >= (1.28 if origin == "native" else 1.35):
        return True

    previous_baseline = _line_baseline(previous_line)
    current_baseline = _line_baseline(current_line)
    baseline_distance = current_baseline - previous_baseline
    if baseline_distance > dominant_size * (2.25 if origin == "native" else 2.4):
        return True
    if len(current_group) >= 2:
        group_baselines = [_line_baseline(line) for line in current_group]
        internal_distances = [
            current - previous
            for previous, current in zip(
                group_baselines,
                group_baselines[1:],
                strict=False,
            )
            if current > previous
        ]
        internal_rhythm = (
            statistics.median(internal_distances)
            if internal_distances
            else dominant_size * 1.2
        )
        rhythm_tolerance = 1.55 if origin == "ocr" else 1.45
        if baseline_distance > max(
            dominant_size * rhythm_tolerance,
            internal_rhythm * rhythm_tolerance,
        ):
            return True

    horizontal_jump = abs(current_rectangle.x0 - previous_rectangle.x0)
    if horizontal_jump > max(dominant_size * 4, page_rectangle.width * 0.12):
        return True

    group_lefts = [fitz.Rect(line["bbox"]).x0 for line in current_group]
    continuation_left = (
        statistics.median(group_lefts[1:])
        if len(group_lefts) > 1
        else group_lefts[0]
    )
    edge_tolerance = _edge_tolerance(dominant_size, origin)
    left_difference = current_rectangle.x0 - continuation_left
    if len(current_group) == 1:
        first_line_indent_limit = max(dominant_size * 3.2, page_rectangle.width * 0.08)
        if abs(left_difference) <= first_line_indent_limit:
            return False
    elif abs(left_difference) <= edge_tolerance:
        return False

    same_left_family = abs(left_difference) <= max(
        edge_tolerance * 2,
        dominant_size * 1.2,
    )
    if same_left_family:
        return False

    return abs(left_difference) > edge_tolerance


def _analyze_group(
    lines: Sequence[LogicalLine],
    page_rectangle: fitz.Rect,
    content_rectangle: fitz.Rect,
    *,
    origin: TextOrigin,
) -> _ParagraphGeometry:
    rectangles = [fitz.Rect(line["bbox"]) for line in lines]
    bbox = fitz.Rect(rectangles[0])
    for rectangle in rectangles[1:]:
        bbox |= rectangle
    dominant_size = _dominant_font_size(lines)
    logical_left, logical_right = _logical_horizontal_bounds(
        bbox,
        page_rectangle,
        content_rectangle,
        line_count=len(lines),
    )
    lefts = [rectangle.x0 for rectangle in rectangles]
    rights = [rectangle.x1 for rectangle in rectangles]
    continuation_left = (
        statistics.median(lefts[1:]) if len(lefts) > 1 else lefts[0]
    )
    edge_tolerance = _edge_tolerance(dominant_size, origin)
    first_line_delta = lefts[0] - continuation_left
    first_line_indent = (
        _round_points(first_line_delta)
        if abs(first_line_delta) >= edge_tolerance
        else 0
    )
    left_edge = continuation_left if len(lefts) > 1 else lefts[0]
    full_line_rights = rights[:-1] if len(rights) > 1 else rights
    right_edge = max(full_line_rights, default=rights[-1])
    left_indent = _normalized_indent(left_edge - logical_left)
    right_indent = _normalized_indent(logical_right - right_edge)
    alignment = _detect_alignment(
        rectangles,
        logical_left=logical_left,
        logical_right=logical_right,
        dominant_size=dominant_size,
        first_line_indent=first_line_indent,
        origin=origin,
    )
    if alignment == "center":
        left_indent = 0
        right_indent = 0
        first_line_indent = 0
    elif alignment == "right":
        left_indent = 0
        first_line_indent = 0
    source_spacing = _source_line_spacing_ratio(lines, dominant_size)
    line_spacing = normalize_line_spacing(source_spacing, len(lines))
    internal_bbox_gaps = [
        max(0, current.y0 - previous.y1)
        for previous, current in zip(rectangles, rectangles[1:], strict=False)
    ]
    return _ParagraphGeometry(
        lines=tuple(lines),
        bbox=(bbox.x0, bbox.y0, bbox.x1, bbox.y1),
        left_edge=left_edge,
        right_edge=right_edge,
        first_line_left=lefts[0],
        dominant_font_size=dominant_size,
        alignment=alignment,
        source_line_spacing_ratio=source_spacing,
        line_spacing_ratio=line_spacing,
        first_line_indent=first_line_indent,
        left_indent=left_indent,
        right_indent=right_indent,
        median_internal_bbox_gap=(
            statistics.median(internal_bbox_gaps) if internal_bbox_gaps else 0
        ),
    )


def _detect_alignment(
    rectangles: Sequence[fitz.Rect],
    *,
    logical_left: float,
    logical_right: float,
    dominant_size: float,
    first_line_indent: float,
    origin: TextOrigin,
) -> ParagraphAlignment:
    lefts = [rectangle.x0 for rectangle in rectangles]
    rights = [rectangle.x1 for rectangle in rectangles]
    centers = [(rectangle.x0 + rectangle.x1) / 2 for rectangle in rectangles]
    widths = [rectangle.width for rectangle in rectangles]
    logical_width = max(1, logical_right - logical_left)
    tolerance = _edge_tolerance(dominant_size, origin)
    center_tolerance = tolerance * 1.35

    if len(rectangles) == 1:
        center = centers[0]
        logical_center = (logical_left + logical_right) / 2
        single_center_tolerance = max(
            center_tolerance,
            logical_width * 0.05,
        )
        if (
            abs(center - logical_center) <= single_center_tolerance
            and widths[0] <= logical_width * 0.8
        ):
            return "center"
        if (
            abs(rights[0] - logical_right) <= tolerance
            and lefts[0] > logical_left + tolerance * 2
        ):
            return "right"
        return "left"

    left_spread = _spread(lefts)
    right_spread = _spread(rights)
    center_spread = _spread(centers)
    logical_center = (logical_left + logical_right) / 2
    if (
        center_spread <= center_tolerance
        and abs(statistics.median(centers) - logical_center) <= center_tolerance
        and (left_spread > tolerance or right_spread > tolerance)
    ):
        return "center"

    if len(rectangles) >= 4:
        full_rectangles = list(rectangles[:-1])
        if first_line_indent and len(full_rectangles) > 1:
            full_rectangles = full_rectangles[1:]
        full_lefts = [rectangle.x0 for rectangle in full_rectangles]
        full_rights = [rectangle.x1 for rectangle in full_rectangles]
        full_widths = [rectangle.width for rectangle in full_rectangles]
        last_width = rectangles[-1].width
        justified_right_tolerance = max(
            tolerance * 1.25,
            dominant_size * (1.6 if origin == "ocr" else 1.5),
        )
        if (
            len(full_rectangles) >= 2
            and _spread(full_lefts) <= tolerance
            and _spread(full_rights) <= justified_right_tolerance
            and statistics.median(full_widths) >= logical_width * 0.72
            and last_width <= statistics.median(full_widths) * 1.02
        ):
            return "justify"

    if right_spread <= tolerance and left_spread > tolerance * 1.25:
        return "right"
    return "left"


def normalize_line_spacing(source_ratio: float, line_count: int) -> float:
    if line_count < 2 or source_ratio <= 0:
        return 1.1
    ratio = min(2.05, max(0.95, source_ratio))
    categories = (
        (1.075, 1.0),
        (1.225, 1.15),
        (1.425, 1.2),
        (1.65, 1.5),
        (1.85, 1.75),
        (float("inf"), 2.0),
    )
    return next(value for upper_bound, value in categories if ratio <= upper_bound)


def normalize_paragraph_gap(source_gap: float, font_size: float) -> float:
    if source_gap <= max(2, font_size * 0.3):
        return 0
    extra_gap = max(0, source_gap - font_size * 0.2)
    if extra_gap < 3:
        return 2
    return 3


def _source_line_spacing_ratio(
    lines: Sequence[LogicalLine],
    dominant_font_size: float,
) -> float:
    if len(lines) < 2 or dominant_font_size <= 0:
        return 0
    baselines = [_line_baseline(line) for line in lines]
    distances = [
        current - previous
        for previous, current in zip(baselines, baselines[1:], strict=False)
        if current > previous
    ]
    return (
        statistics.median(distances) / dominant_font_size
        if distances
        else 0
    )


def _line_baseline(line: LogicalLine) -> float:
    if line.baseline:
        return line.baseline
    origins = [
        float(span["origin"][1])
        for span in line.get("spans", [])
        if span.get("origin") and len(span["origin"]) >= 2
    ]
    if origins:
        return statistics.median(origins)
    rectangle = fitz.Rect(line["bbox"])
    return rectangle.y1 - rectangle.height * 0.2


def _dominant_font_size(lines: Sequence[LogicalLine]) -> float:
    sizes = [
        float(span.get("size", 0))
        for line in lines
        for span in line.get("spans", [])
        if str(span.get("text", "")).strip()
        and float(span.get("size", 0)) > 0
    ]
    return statistics.median(sizes) if sizes else 11


def _logical_horizontal_bounds(
    block_rectangle: fitz.Rect,
    page_rectangle: fitz.Rect,
    content_rectangle: fitz.Rect,
    *,
    line_count: int,
) -> tuple[float, float]:
    if line_count > 1 and block_rectangle.width <= page_rectangle.width * 0.48:
        return block_rectangle.x0, block_rectangle.x1
    left = min(block_rectangle.x0, content_rectangle.x0)
    right = max(block_rectangle.x1, content_rectangle.x1)
    return left, right


def _paragraph_space_after(
    current: _ParagraphGeometry,
    following: _ParagraphGeometry | None,
) -> float:
    if following is None:
        return 2
    source_gap = max(0, following.bbox[1] - current.bbox[3])
    extra_gap = max(0, source_gap - current.median_internal_bbox_gap)
    if extra_gap < 1:
        return 2
    return 3


def _normalized_indent(value: float) -> float:
    return _round_points(max(0, value)) if value >= 2 else 0


def _round_points(value: float) -> float:
    return round(value * 2) / 2


def _edge_tolerance(font_size: float, origin: TextOrigin) -> float:
    native_tolerance = max(2, font_size * 0.28)
    return native_tolerance * (1.5 if origin == "ocr" else 1)


def _spread(values: Sequence[float]) -> float:
    return max(values) - min(values) if values else 0


def _line_text(line: LogicalLine | dict[str, Any]) -> str:
    if isinstance(line, LogicalLine):
        return line.text
    return "".join(str(span.get("text", "")) for span in line.get("spans", []))

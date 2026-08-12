from __future__ import annotations

import math
import hashlib
import re
import statistics
import unicodedata
from dataclasses import dataclass, replace
from difflib import SequenceMatcher
from typing import Any, Literal, Sequence


HEADER_ZONE_RATIO = 0.15
FOOTER_ZONE_RATIO = 0.15
TEXT_SIMILARITY_THRESHOLD = 0.82
POSITION_RATIO_TOLERANCE = 0.04
ANCHOR_RATIO_TOLERANCE = 0.08

BlockAlignment = Literal["left", "center", "right"]
TextOrigin = Literal["native", "ocr"]
PageNumberKind = Literal["number", "page", "slash", "page_of"]
StoryType = Literal["header", "body", "footer"]


@dataclass(frozen=True)
class TextStyle:
    font_family: str
    font_size: float
    bold: bool
    italic: bool
    color: int


@dataclass(frozen=True)
class LayoutBlock:
    source_index: int
    page_index: int
    text: str
    bbox: tuple[float, float, float, float]
    page_width: float
    page_height: float
    alignment: BlockAlignment
    style: TextStyle
    origin: TextOrigin
    raw_lines: tuple[dict[str, Any], ...]
    story_type: StoryType = "body"
    classification_confidence: float = 0

    @property
    def vertical_anchor(self) -> float:
        return ((self.bbox[1] + self.bbox[3]) / 2) / max(1, self.page_height)

    @property
    def horizontal_anchor(self) -> float:
        if self.alignment == "left":
            return self.bbox[0] / max(1, self.page_width)
        if self.alignment == "right":
            return self.bbox[2] / max(1, self.page_width)
        return ((self.bbox[0] + self.bbox[2]) / 2) / max(1, self.page_width)


@dataclass(frozen=True)
class ImageLayoutBlock:
    source_index: int
    page_index: int
    bbox: tuple[float, float, float, float]
    page_width: float
    page_height: float
    alignment: BlockAlignment
    image_digest: str
    source_block: dict[str, Any]
    story_type: StoryType = "body"
    classification_confidence: float = 0

    @property
    def vertical_anchor(self) -> float:
        return ((self.bbox[1] + self.bbox[3]) / 2) / max(1, self.page_height)

    @property
    def horizontal_anchor(self) -> float:
        return ((self.bbox[0] + self.bbox[2]) / 2) / max(1, self.page_width)

    @property
    def width_ratio(self) -> float:
        return (self.bbox[2] - self.bbox[0]) / max(1, self.page_width)

    @property
    def height_ratio(self) -> float:
        return (self.bbox[3] - self.bbox[1]) / max(1, self.page_height)


@dataclass(frozen=True)
class PageNumberFormat:
    kind: PageNumberKind
    current: int
    total: int | None
    prefix: str
    separator: str
    suffix: str

    @property
    def uses_total(self) -> bool:
        return self.total is not None


@dataclass(frozen=True)
class PageNumberCandidate:
    block: LayoutBlock
    format: PageNumberFormat


@dataclass(frozen=True)
class PageLayoutInput:
    page_index: int
    width: float
    height: float
    blocks: Sequence[dict[str, Any]]
    origin: TextOrigin = "native"


@dataclass(frozen=True)
class PageLayout:
    page_index: int
    width: float
    height: float
    header_candidates: tuple[LayoutBlock, ...]
    header_images: tuple[ImageLayoutBlock, ...]
    body_blocks: tuple[LayoutBlock, ...]
    footer_candidates: tuple[LayoutBlock, ...]
    footer_images: tuple[ImageLayoutBlock, ...]
    page_number_candidate: PageNumberCandidate | None

    @property
    def classified_source_indexes(self) -> frozenset[int]:
        indexes = {
            block.source_index
            for block in (
                *self.header_candidates,
                *self.header_images,
                *self.footer_candidates,
                *self.footer_images,
            )
        }
        if self.page_number_candidate is not None:
            indexes.add(self.page_number_candidate.block.source_index)
        return frozenset(indexes)


@dataclass(frozen=True)
class PaginationSequence:
    start_page_index: int
    start_number: int
    page_indexes: tuple[int, ...]


@dataclass(frozen=True)
class DocumentLayout:
    pages: tuple[PageLayout, ...]
    pagination: PaginationSequence | None


def normalize_repeated_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = re.sub(r"[\s\u00a0]+", " ", normalized).strip()
    return re.sub(r"[^\w\s]", "", normalized)


def parse_page_number(value: str) -> PageNumberFormat | None:
    match = re.fullmatch(
        r"\s*(?P<prefix>page\s+)?(?P<current>\d{1,4})"
        r"(?:\s*(?P<separator>/|sur)\s*(?P<total>\d{1,4}))?\s*",
        value,
        flags=re.IGNORECASE,
    )
    if match is None:
        return None

    prefix = "Page " if match.group("prefix") else ""
    separator = match.group("separator") or ""
    total = int(match.group("total")) if match.group("total") else None
    if total is not None and int(match.group("current")) > total:
        return None

    if total is not None and separator.casefold() == "sur":
        kind: PageNumberKind = "page_of"
        separator = " sur "
    elif total is not None:
        kind = "slash"
        separator = " / "
    elif prefix:
        kind = "page"
    else:
        kind = "number"

    return PageNumberFormat(
        kind=kind,
        current=int(match.group("current")),
        total=total,
        prefix=prefix,
        separator=separator,
        suffix="",
    )


def detect_document_layout(inputs: Sequence[PageLayoutInput]) -> DocumentLayout:
    """Classify provenance-rich raw blocks before paragraph reconstruction.

    Text and image candidates retain their page, bbox, source index, origin,
    confidence, and story type. Body and header/footer stories can therefore
    canonicalize their own ``LogicalLine`` objects without losing the regional
    decision made here.
    """

    extracted_pages = tuple(_extract_page_blocks(page) for page in inputs)
    extracted_image_pages = tuple(_extract_page_images(page) for page in inputs)
    edge_blocks = tuple(
        block
        for blocks in extracted_pages
        for block in blocks
        if _edge_zone(block) is not None
    )
    page_numbers, pagination = _detect_pagination(edge_blocks, len(inputs))
    page_number_indexes = {
        (candidate.block.page_index, candidate.block.source_index)
        for candidate in page_numbers
    }

    header_blocks = tuple(
        block
        for block in edge_blocks
        if _edge_zone(block) == "header"
        and (block.page_index, block.source_index) not in page_number_indexes
    )
    footer_blocks = tuple(
        block
        for block in edge_blocks
        if _edge_zone(block) == "footer"
        and (block.page_index, block.source_index) not in page_number_indexes
    )
    repeated_headers = tuple(
        _with_story(block, "header", confidence=1)
        for block in _detect_repeated_blocks(header_blocks, len(inputs))
    )
    repeated_footers = tuple(
        _with_story(block, "footer", confidence=1)
        for block in _detect_repeated_blocks(footer_blocks, len(inputs))
    )
    image_edge_blocks = tuple(
        block
        for blocks in extracted_image_pages
        for block in blocks
        if _image_edge_zone(block) is not None
    )
    repeated_header_images = tuple(
        replace(block, story_type="header", classification_confidence=1)
        for block in _detect_repeated_images(
            tuple(
                block
                for block in image_edge_blocks
                if _image_edge_zone(block) == "header"
            ),
            len(inputs),
        )
    )
    repeated_footer_images = tuple(
        replace(block, story_type="footer", classification_confidence=1)
        for block in _detect_repeated_images(
            tuple(
                block
                for block in image_edge_blocks
                if _image_edge_zone(block) == "footer"
            ),
            len(inputs),
        )
    )
    header_indexes = {
        (block.page_index, block.source_index) for block in repeated_headers
    }
    footer_indexes = {
        (block.page_index, block.source_index) for block in repeated_footers
    }
    header_image_indexes = {
        (block.page_index, block.source_index)
        for block in repeated_header_images
    }
    footer_image_indexes = {
        (block.page_index, block.source_index)
        for block in repeated_footer_images
    }
    page_numbers_by_page = {
        candidate.block.page_index: candidate for candidate in page_numbers
    }

    layouts: list[PageLayout] = []
    for page_input, blocks, image_blocks in zip(
        inputs,
        extracted_pages,
        extracted_image_pages,
        strict=True,
    ):
        headers = tuple(
            _with_story(block, "header", confidence=1)
            for block in blocks
            if (block.page_index, block.source_index) in header_indexes
        )
        footers = tuple(
            _with_story(block, "footer", confidence=1)
            for block in blocks
            if (block.page_index, block.source_index) in footer_indexes
        )
        header_images = tuple(
            replace(
                block,
                story_type="header",
                classification_confidence=1,
            )
            for block in image_blocks
            if (block.page_index, block.source_index) in header_image_indexes
        )
        footer_images = tuple(
            replace(
                block,
                story_type="footer",
                classification_confidence=1,
            )
            for block in image_blocks
            if (block.page_index, block.source_index) in footer_image_indexes
        )
        page_number = page_numbers_by_page.get(page_input.page_index)
        classified_indexes = {
            *(block.source_index for block in headers),
            *(block.source_index for block in footers),
            *(block.source_index for block in header_images),
            *(block.source_index for block in footer_images),
        }
        if page_number is not None:
            classified_indexes.add(page_number.block.source_index)
        body = tuple(
            _with_story(block, "body", confidence=1)
            for block in blocks
            if block.source_index not in classified_indexes
        )
        layouts.append(
            PageLayout(
                page_index=page_input.page_index,
                width=page_input.width,
                height=page_input.height,
                header_candidates=tuple(sorted(headers, key=_block_sort_key)),
                header_images=tuple(
                    sorted(header_images, key=_image_block_sort_key)
                ),
                body_blocks=body,
                footer_candidates=tuple(sorted(footers, key=_block_sort_key)),
                footer_images=tuple(
                    sorted(footer_images, key=_image_block_sort_key)
                ),
                page_number_candidate=page_number,
            )
        )
    return DocumentLayout(pages=tuple(layouts), pagination=pagination)


def _extract_page_blocks(page: PageLayoutInput) -> tuple[LayoutBlock, ...]:
    return tuple(
        block
        for source_index, source_block in enumerate(page.blocks)
        if (
            block := _extract_text_block(
                source_block,
                source_index=source_index,
                page=page,
            )
        )
        is not None
    )


def _extract_page_images(
    page: PageLayoutInput,
) -> tuple[ImageLayoutBlock, ...]:
    return tuple(
        block
        for source_index, source_block in enumerate(page.blocks)
        if (
            block := _extract_image_block(
                source_block,
                source_index=source_index,
                page=page,
            )
        )
        is not None
    )


def _extract_text_block(
    source_block: dict[str, Any],
    *,
    source_index: int,
    page: PageLayoutInput,
) -> LayoutBlock | None:
    if source_block.get("type") != 0 or not source_block.get("bbox"):
        return None
    spans = [
        span
        for line in source_block.get("lines", [])
        for span in line.get("spans", [])
        if str(span.get("text", "")).strip()
    ]
    if not spans:
        return None
    text = " ".join(str(span.get("text", "")).strip() for span in spans)
    bbox = tuple(float(value) for value in source_block["bbox"])
    if len(bbox) != 4:
        return None
    weights = [max(1, len(str(span.get("text", "")).strip())) for span in spans]
    font_family = max(
        (str(span.get("font", "Arial")).split("+")[-1] for span in spans),
        key=lambda font: sum(
            weight
            for span, weight in zip(spans, weights, strict=True)
            if str(span.get("font", "Arial")).split("+")[-1] == font
        ),
    )
    font_size = statistics.median(float(span.get("size", 11)) for span in spans)
    character_count = sum(weights)
    bold_count = sum(
        weight
        for span, weight in zip(spans, weights, strict=True)
        if int(span.get("flags", 0)) & 16
        or "bold" in str(span.get("font", "")).casefold()
    )
    italic_count = sum(
        weight
        for span, weight in zip(spans, weights, strict=True)
        if int(span.get("flags", 0)) & 2
        or any(
            marker in str(span.get("font", "")).casefold()
            for marker in ("italic", "oblique")
        )
    )
    color = max(
        (int(span.get("color", 0)) for span in spans),
        key=lambda candidate: sum(
            weight
            for span, weight in zip(spans, weights, strict=True)
            if int(span.get("color", 0)) == candidate
        ),
    )
    raw_lines = tuple(
        {
            **line,
            "_source_block_index": source_index,
            "_page_index": page.page_index,
            "_story_type": "body",
            "_origin": page.origin,
        }
        for line in source_block.get("lines", [])
        if any(
            str(span.get("text", "")).strip()
            for span in line.get("spans", [])
        )
    )
    return LayoutBlock(
        source_index=source_index,
        page_index=page.page_index,
        text=text,
        bbox=(bbox[0], bbox[1], bbox[2], bbox[3]),
        page_width=page.width,
        page_height=page.height,
        alignment=_estimate_alignment(bbox, page.width),
        style=TextStyle(
            font_family=font_family,
            font_size=font_size,
            bold=bold_count / character_count >= 0.5,
            italic=italic_count / character_count >= 0.5,
            color=color,
        ),
        origin=page.origin,
        raw_lines=raw_lines,
    )


def _extract_image_block(
    source_block: dict[str, Any],
    *,
    source_index: int,
    page: PageLayoutInput,
) -> ImageLayoutBlock | None:
    image = source_block.get("image")
    if (
        source_block.get("type") != 1
        or not source_block.get("bbox")
        or not isinstance(image, bytes)
    ):
        return None
    bbox = tuple(float(value) for value in source_block["bbox"])
    if len(bbox) != 4 or bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        return None
    mask = source_block.get("mask")
    digest_input = image + (mask if isinstance(mask, bytes) else b"")
    return ImageLayoutBlock(
        source_index=source_index,
        page_index=page.page_index,
        bbox=(bbox[0], bbox[1], bbox[2], bbox[3]),
        page_width=page.width,
        page_height=page.height,
        alignment=_estimate_alignment(bbox, page.width),
        image_digest=hashlib.sha256(digest_input).hexdigest(),
        source_block=dict(source_block),
    )


def _estimate_alignment(
    bbox: tuple[float, ...], page_width: float
) -> BlockAlignment:
    center = (bbox[0] + bbox[2]) / 2
    if abs(center - page_width / 2) <= page_width * 0.08:
        return "center"
    left_distance = bbox[0]
    right_distance = page_width - bbox[2]
    if bbox[0] >= page_width * 0.55 or right_distance < left_distance * 0.6:
        return "right"
    return "left"


def _edge_zone(block: LayoutBlock) -> Literal["header", "footer"] | None:
    if block.bbox[3] <= block.page_height * HEADER_ZONE_RATIO:
        return "header"
    if block.bbox[1] >= block.page_height * (1 - FOOTER_ZONE_RATIO):
        return "footer"
    return None


def _image_edge_zone(
    block: ImageLayoutBlock,
) -> Literal["header", "footer"] | None:
    if block.bbox[3] <= block.page_height * HEADER_ZONE_RATIO:
        return "header"
    if block.bbox[1] >= block.page_height * (1 - FOOTER_ZONE_RATIO):
        return "footer"
    return None


def _detect_pagination(
    blocks: Sequence[LayoutBlock], page_count: int
) -> tuple[tuple[PageNumberCandidate, ...], PaginationSequence | None]:
    if page_count < 2:
        return (), None
    candidates = tuple(
        PageNumberCandidate(block=block, format=parsed)
        for block in blocks
        if (parsed := parse_page_number(block.text)) is not None
    )
    groups: list[list[PageNumberCandidate]] = []
    for candidate in candidates:
        for group in groups:
            reference = group[0]
            if (
                candidate.format.kind == reference.format.kind
                and candidate.block.alignment == reference.block.alignment
                and _edge_zone(candidate.block) == _edge_zone(reference.block)
                and abs(
                    candidate.block.vertical_anchor
                    - reference.block.vertical_anchor
                )
                <= POSITION_RATIO_TOLERANCE
                and abs(
                    candidate.block.horizontal_anchor
                    - reference.block.horizontal_anchor
                )
                <= ANCHOR_RATIO_TOLERANCE
                and (
                    candidate.format.total == reference.format.total
                    or candidate.format.total is None
                    or reference.format.total is None
                )
            ):
                group.append(candidate)
                break
        else:
            groups.append([candidate])

    valid_groups: list[list[PageNumberCandidate]] = []
    for group in groups:
        unique_pages = {candidate.block.page_index for candidate in group}
        if len(unique_pages) < _minimum_repetition_count(page_count):
            continue
        offsets = {
            candidate.format.current - candidate.block.page_index
            for candidate in group
        }
        ordered = sorted(group, key=lambda item: item.block.page_index)
        currents = [candidate.format.current for candidate in ordered]
        is_strictly_increasing = all(
            following > previous
            for previous, following in zip(currents, currents[1:], strict=False)
        )
        if len(offsets) != 1 and not is_strictly_increasing:
            continue
        valid_groups.append(group)

    if not valid_groups:
        return (), None
    best_group = max(
        valid_groups,
        key=lambda group: (len(group), -min(item.block.page_index for item in group)),
    )
    selected = tuple(
        PageNumberCandidate(
            block=_with_story(
                candidate.block,
                "header"
                if _edge_zone(candidate.block) == "header"
                else "footer",
                confidence=1,
            ),
            format=candidate.format,
        )
        for candidate in sorted(
            best_group,
            key=lambda candidate: candidate.block.page_index,
        )
    )
    first = selected[0]
    return selected, PaginationSequence(
        start_page_index=first.block.page_index,
        start_number=first.format.current,
        page_indexes=tuple(candidate.block.page_index for candidate in selected),
    )


def _detect_repeated_blocks(
    blocks: Sequence[LayoutBlock], page_count: int
) -> tuple[LayoutBlock, ...]:
    if page_count < 2:
        return ()
    clusters: list[list[LayoutBlock]] = []
    for block in blocks:
        for cluster in clusters:
            reference = cluster[0]
            if _blocks_match(reference, block):
                if all(item.page_index != block.page_index for item in cluster):
                    cluster.append(block)
                break
        else:
            clusters.append([block])

    selected: list[LayoutBlock] = []
    minimum = _minimum_repetition_count(page_count)
    for cluster in clusters:
        pages = sorted(block.page_index for block in cluster)
        if len(pages) < minimum:
            continue
        coverage = len(pages) / max(1, page_count)
        longest_run = _longest_consecutive_run(pages)
        if coverage < 0.5 and longest_run < 3:
            continue
        selected.extend(cluster)
    return tuple(selected)


def _detect_repeated_images(
    blocks: Sequence[ImageLayoutBlock],
    page_count: int,
) -> tuple[ImageLayoutBlock, ...]:
    if page_count < 2:
        return ()
    clusters: list[list[ImageLayoutBlock]] = []
    for block in blocks:
        for cluster in clusters:
            reference = cluster[0]
            if _images_match(reference, block):
                if all(item.page_index != block.page_index for item in cluster):
                    cluster.append(block)
                break
        else:
            clusters.append([block])

    minimum = _minimum_repetition_count(page_count)
    return tuple(
        block
        for cluster in clusters
        if len({block.page_index for block in cluster}) >= minimum
        for block in cluster
    )


def _images_match(
    first: ImageLayoutBlock,
    second: ImageLayoutBlock,
) -> bool:
    return (
        first.image_digest == second.image_digest
        and abs(first.vertical_anchor - second.vertical_anchor) <= 0.015
        and abs(first.horizontal_anchor - second.horizontal_anchor) <= 0.025
        and abs(first.width_ratio - second.width_ratio) <= 0.015
        and abs(first.height_ratio - second.height_ratio) <= 0.015
    )


def _blocks_match(first: LayoutBlock, second: LayoutBlock) -> bool:
    if (
        first.alignment != second.alignment
        or abs(first.vertical_anchor - second.vertical_anchor)
        > POSITION_RATIO_TOLERANCE
        or abs(first.horizontal_anchor - second.horizontal_anchor)
        > ANCHOR_RATIO_TOLERANCE
    ):
        return False
    first_text = normalize_repeated_text(first.text)
    second_text = normalize_repeated_text(second.text)
    if not first_text or not second_text:
        return False
    return (
        SequenceMatcher(None, first_text, second_text).ratio()
        >= TEXT_SIMILARITY_THRESHOLD
    )


def _minimum_repetition_count(page_count: int) -> int:
    if page_count == 2:
        return page_count
    return min(3, math.ceil(page_count * 0.6))


def _longest_consecutive_run(page_indexes: Sequence[int]) -> int:
    longest = current = 0
    previous: int | None = None
    for page_index in page_indexes:
        current = current + 1 if previous is not None and page_index == previous + 1 else 1
        longest = max(longest, current)
        previous = page_index
    return longest


def _block_sort_key(block: LayoutBlock) -> tuple[float, float]:
    return block.bbox[1], block.bbox[0]


def _image_block_sort_key(block: ImageLayoutBlock) -> tuple[float, float]:
    return block.bbox[1], block.bbox[0]


def _with_story(
    block: LayoutBlock,
    story_type: StoryType,
    *,
    confidence: float,
) -> LayoutBlock:
    return replace(
        block,
        raw_lines=tuple(
            {
                **line,
                "_story_type": story_type,
                "_story_confidence": confidence,
                "_page_index": block.page_index,
                "_origin": block.origin,
            }
            for line in block.raw_lines
        ),
        story_type=story_type,
        classification_confidence=confidence,
    )

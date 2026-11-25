"""Identify source Form placements and replace affected page content safely."""

from __future__ import annotations

import hashlib
import math
from collections import defaultdict
from collections.abc import Iterable

import fitz
from pypdf import PageObject, Transformation
from pypdf.errors import PdfReadError
from pypdf.generic import DictionaryObject

DPI = 200
MAX_PAGE_PIXELS = 24_000_000
MAX_TOTAL_PIXELS = 96_000_000


def intersects_form(page: PageObject, zones: Iterable[fitz.Rect]) -> bool:
    """Only prove a Form off-zone when its full transformed BBox is off-zone."""
    try:
        resources = page["/Resources"].get_object()
        xobjects = resources.get("/XObject", DictionaryObject()).get_object()
        contents = page.get_contents()
        if contents is None:
            return False
        matrix = Transformation()
        stack: list[Transformation] = []
        for operands, operator in contents.operations:
            if operator == b"q":
                stack.append(matrix)
            elif operator == b"Q":
                matrix = stack.pop()
            elif operator == b"cm":
                matrix = Transformation(tuple(map(float, operands))).transform(matrix)
            elif operator == b"Do":
                xobject = xobjects[operands[0]].get_object()
                if xobject.get("/Subtype") != "/Form":
                    continue
                x0, y0, x1, y1 = map(float, xobject["/BBox"])
                transform = Transformation(
                    tuple(map(float, xobject.get("/Matrix", (1, 0, 0, 1, 0, 0))))
                ).transform(matrix)
                points = [
                    transform.apply_on((x, y)) for x in (x0, x1) for y in (y0, y1)
                ]
                xs, ys = zip(*points, strict=True)
                bound = fitz.Rect(min(xs), min(ys), max(xs), max(ys))
                if not all(math.isfinite(value) for value in bound) or bound.is_empty:
                    return True
                if any(bound.intersects(rect) for rect in zones):
                    return True
    except (KeyError, IndexError, TypeError, ValueError, ArithmeticError, PdfReadError):
        return True
    return False


def related_raster_pages(document: fitz.Document, affected: set[int]) -> set[int]:
    """Close over shared Form and image resources so original streams cannot leak."""
    if not affected:
        return set()
    pages_by_resource: dict[int, set[int]] = defaultdict(set)
    resources_by_page = []
    for page in document:
        resources = {item[0] for item in page.get_xobjects()}
        resources.update(item[0] for item in page.get_images(full=True))
        resources.update(item[1] for item in page.get_images(full=True) if item[1])
        resources_by_page.append(resources)
        for xref in resources:
            pages_by_resource[xref].add(page.number)
    result = affected.copy()
    pending = list(affected)
    visited_resources: set[int] = set()
    while pending:
        for xref in resources_by_page[pending.pop()] - visited_resources:
            visited_resources.add(xref)
            for number in pages_by_resource[xref] - result:
                result.add(number)
                pending.append(number)
    return result


def stream_digest(document: fitz.Document, xref: int) -> bytes:
    return hashlib.sha256(document.xref_stream(xref)).digest()


def rasterize_page(
    document: fitz.Document, number: int, zones: list[fitz.Rect]
) -> bytes:
    """Overwrite the pixels before building entirely new page resources."""
    page = document[number]
    scale = DPI / 72
    rotation = page.rotation
    page.set_rotation(0)
    pixmap = page.get_pixmap(dpi=DPI, colorspace=fitz.csRGB, alpha=False, annots=False)
    if pixmap.width * pixmap.height > MAX_PAGE_PIXELS:
        raise ValueError("Raster page exceeds budget")
    for rect in zones:
        # Include partial pixels at each edge. Never preserve original samples under the fill.
        box = fitz.IRect(
            math.floor(rect.x0 * scale),
            math.floor(rect.y0 * scale),
            math.ceil(rect.x1 * scale),
            math.ceil(rect.y1 * scale),
        )
        if not pixmap.set_rect(box, (0, 0, 0)):
            raise ValueError("Raster mask did not intersect the page")
    xref = page.xref
    document.xref_set_key(xref, "Contents", "null")
    document.xref_set_key(xref, "Resources", "<<>>")
    document.xref_set_key(xref, "Thumb", "null")
    page.insert_image(page.rect, pixmap=pixmap, keep_proportion=False)
    page.set_rotation(rotation)
    return hashlib.sha256(pixmap.samples_mv).digest()

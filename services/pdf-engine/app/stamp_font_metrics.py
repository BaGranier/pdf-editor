"""Exact ink bounds from the shipped TrueType glyf headers, including composites.

MuPDF 1.26.3 glyph_bbox may return the global font box for these fonts. Do not
use that overly broad box for visual centering or diagonal fit calculations.
"""

import struct

import fitz


def measured_glyphs(font: fitz.Font, codes: set[int]) -> dict[int, list[float]]:
    data = font.buffer
    try:
        count = struct.unpack_from(">H", data, 4)[0]
        tables = {}
        for index in range(count):
            tag, _, offset, length = struct.unpack_from(">4sIII", data, 12 + index * 16)
            if offset + length > len(data):
                raise ValueError("Invalid font table")
            tables[tag] = offset
        head, loca, glyf = (tables[tag] for tag in (b"head", b"loca", b"glyf"))
        long_offsets = struct.unpack_from(">h", data, head + 50)[0] == 1
        result = {}
        for code in sorted(codes):
            gid = font.has_glyph(code)
            if not gid:
                continue
            if long_offsets:
                start, end = struct.unpack_from(">II", data, loca + gid * 4)
            else:
                a, b = struct.unpack_from(">HH", data, loca + gid * 2)
                start, end = a * 2, b * 2
            units = struct.unpack_from(">H", data, head + 18)[0]
            bounds = (
                struct.unpack_from(">hhhh", data, glyf + start + 2)
                if start != end
                else (0, 0, 0, 0)
            )
            result[code] = [
                font.glyph_advance(code),
                *(value / units for value in bounds),
            ]
        return result
    except (KeyError, struct.error, ZeroDivisionError) as error:
        raise ValueError("Shipped TrueType font metrics are unavailable") from error


def write_stamp_unicode_map(
    document: fitz.Document, font_xref: int, font: fitz.Font, text: str
) -> None:
    """Keep only the supported, used mappings; MuPDF's full Noto map has malformed
    non-BMP entries in 1.26.3. Identity-H codes are the inserted TrueType glyph IDs.
    This is scoped to the new temporary stamp font, never to a source PDF font.
    """
    mappings: dict[int, int] = {}
    for char in text:
        if char == "\n":
            continue
        code, glyph = ord(char), font.has_glyph(ord(char))
        if not glyph or glyph > 0xFFFF or mappings.get(glyph, code) != code:
            raise ValueError(
                "The stamp font cannot encode distinct requested characters"
            )
        mappings[glyph] = code
    kind, reference = document.xref_get_key(font_xref, "ToUnicode")
    if kind != "xref":
        raise ValueError("The stamp Unicode map is unavailable")
    rows = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        "/CMapName /StampUnicode def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
    ]
    items = sorted(mappings.items())
    for start in range(0, len(items), 100):
        batch = items[start : start + 100]
        rows.append(f"{len(batch)} beginbfchar")
        rows.extend(f"<{glyph:04x}> <{code:04x}>" for glyph, code in batch)
        rows.append("endbfchar")
    rows.extend(
        ["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"]
    )
    document.update_stream(int(reference.split()[0]), "\n".join(rows).encode("ascii"))

"""Read supported raster dimensions before the PDF renderer allocates pixels."""

from __future__ import annotations

import struct


def raster_dimensions(data: bytes) -> tuple[int, int]:
    if (
        data.startswith(b"\x89PNG\r\n\x1a\n")
        and len(data) >= 24
        and data[12:16] == b"IHDR"
    ):
        return struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 4 <= len(data):
            if data[offset] != 0xFF:
                raise ValueError("Invalid JPEG marker")
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset + 3 > len(data):
                break
            marker = data[offset]
            offset += 1
            length = int.from_bytes(data[offset : offset + 2], "big")
            if length < 2 or offset + length > len(data):
                break
            if (
                marker
                in {
                    0xC0,
                    0xC1,
                    0xC2,
                    0xC3,
                    0xC5,
                    0xC6,
                    0xC7,
                    0xC9,
                    0xCA,
                    0xCB,
                    0xCD,
                    0xCE,
                    0xCF,
                }
                and length >= 7
            ):
                height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
                return width, height
            if marker == 0xDA:
                break
            offset += length
    raise ValueError("Invalid raster dimensions")

/** Read EXIF orientation without decoding or executing embedded metadata. */
export function jpegOrientation(buffer: ArrayBuffer): number {
  const data = new DataView(buffer);
  try {
    if (data.byteLength < 4 || data.getUint16(0) !== 0xffd8) return 1;
    for (let offset = 2; offset + 4 < data.byteLength;) {
      if (data.getUint8(offset) !== 0xff) return 1;
      const marker = data.getUint8(offset + 1), size = data.getUint16(offset + 2);
      if (size < 2 || offset + 2 + size > data.byteLength) return 1;
      if (marker === 0xe1 && data.getUint32(offset + 4) === 0x45786966 && data.getUint16(offset + 8) === 0) {
        const tiff = offset + 10;
        const little = data.getUint16(tiff) === 0x4949;
        if (!little && data.getUint16(tiff) !== 0x4d4d) return 1;
        if (data.getUint16(tiff + 2, little) !== 42) return 1;
        const ifd = tiff + data.getUint32(tiff + 4, little);
        const count = data.getUint16(ifd, little);
        for (let n = 0; n < count; n++) {
          const entry = ifd + 2 + n * 12;
          if (entry + 12 > offset + size + 2) return 1;
          if (data.getUint16(entry, little) === 0x112 && data.getUint16(entry + 2, little) === 3 && data.getUint32(entry + 4, little) === 1) {
            const orientation = data.getUint16(entry + 8, little);
            return orientation >= 1 && orientation <= 8 ? orientation : 1;
          }
        }
      }
      if (marker === 0xda || marker === 0xd9) return 1;
      offset += 2 + size;
    }
  } catch { /* Truncated EXIF never changes geometry. */ }
  return 1;
}

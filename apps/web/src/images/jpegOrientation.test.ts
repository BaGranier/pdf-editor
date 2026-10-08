import { describe, expect, it } from "vitest";
import { jpegOrientation } from "./jpegOrientation";

function exif(orientation: number, little: boolean) {
  const bytes = new Uint8Array(40);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0xffd8); view.setUint16(2, 0xffe1); view.setUint16(4, 34);
  view.setUint32(6, 0x45786966);
  const tiff = 12;
  view.setUint16(tiff, little ? 0x4949 : 0x4d4d);
  view.setUint16(tiff + 2, 42, little); view.setUint32(tiff + 4, 8, little);
  view.setUint16(20, 1, little); view.setUint16(22, 0x112, little);
  view.setUint16(24, 3, little); view.setUint32(26, 1, little);
  view.setUint16(30, orientation, little);
  return bytes.buffer;
}

describe("jpegOrientation", () => {
  it.each([true, false])("reads bounded TIFF orientation with little endian %s", (little) => {
    for (let direction = 1; direction <= 8; direction++) expect(jpegOrientation(exif(direction, little))).toBe(direction);
    expect(jpegOrientation(exif(9, little))).toBe(1);
  });
  it("ignores malformed and truncated input", () => {
    const source = exif(6, true);
    for (let length = 0; length < 34; length++) expect(jpegOrientation(source.slice(0, length))).toBe(1);
    expect(jpegOrientation(new Uint8Array([1, 2, 3, 4]).buffer)).toBe(1);
  });
});

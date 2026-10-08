import { describe, expect, it } from "vitest";
import { rasterDimensions, validateImageDimensions, validateImageSession } from "./imagePolicy";
import { importLocalImage } from "./importImage";

describe("image allocation policy", () => {
  it("reads PNG and JPEG dimensions before decoding", () => {
    const png = new Uint8Array(24);
    png.set([137, 80, 78, 71, 13, 10, 26, 10]); png.set([73, 72, 68, 82], 12);
    new DataView(png.buffer).setUint32(16, 4000); new DataView(png.buffer).setUint32(20, 3000);
    expect(rasterDimensions(png.buffer, "image/png")).toEqual([4000, 3000]);
    const jpeg = new Uint8Array([255,216,255,192,0,7,8,11,184,15,160]);
    expect(rasterDimensions(jpeg.buffer, "image/jpeg")).toEqual([4000, 3000]);
  });
  it.each([[0, 1], [20001, 1], [12000, 12000], [Infinity, 10]])("rejects unsafe dimensions %s×%s", (w, h) => {
    expect(() => validateImageDimensions(w, h)).toThrow(/dimensions/);
  });
  it("accepts typical smartphone dimensions and counts shared assets once", () => {
    validateImageDimensions(6000, 4000);
    const asset = { id: "shared", width: 6000, height: 4000, mimeType: "image/jpeg" as const, dataUrl: "data:image/jpeg;base64,AA==" };
    validateImageSession(Array(20).fill(asset), asset);
    expect(() => validateImageSession(Array.from({ length: 6 }, (_, i) => ({ ...asset, id: String(i) })), asset)).toThrow(/session/);
  });
  it("rejects an invalid image before constructing a browser bitmap", async () => {
    await expect(importLocalImage(new File(["invalid"], "invalid.png", { type: "image/png" }))).rejects.toThrow(/invalide/);
  });
});

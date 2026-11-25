import { describe, expect, it } from "vitest";
import { getCanvasRenderDimensions } from "./rendering";

describe("getCanvasRenderDimensions", () => {
  it("keeps CSS dimensions separate from a high-DPR canvas backing store", () => {
    expect(getCanvasRenderDimensions(1000, 1400, 2)).toEqual({
      cssWidth: 1000,
      cssHeight: 1400,
      canvasWidth: 2000,
      canvasHeight: 2800,
      outputScale: 2,
    });
  });

  it("uses at least one device pixel per CSS pixel", () => {
    expect(getCanvasRenderDimensions(400, 600, 0)).toMatchObject({
      canvasWidth: 400,
      canvasHeight: 600,
      outputScale: 1,
    });
  });

  it.each([0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.25, 1.5])("preserves source detail at zoom %s without changing geometry", (zoom) => {
    for (const dpr of [1, 1.25, 2]) {
      const result = getCanvasRenderDimensions(600 * zoom, 800 * zoom, dpr, zoom);
      expect(result.cssWidth).toBe(600 * zoom);
      expect(result.cssHeight).toBe(800 * zoom);
      expect(result.outputScale).toBeCloseTo(Math.max(dpr, Math.min(2, 1 / zoom)));
      expect(result.canvasWidth).toBeGreaterThanOrEqual(600 - 1);
      expect(result.canvasHeight).toBeGreaterThanOrEqual(800 - 1);
    }
  });

  it("caps huge pages and high DPR without allocating unbounded bitmaps", () => {
    const result = getCanvasRenderDimensions(10000, 20000, 3, 0.5);
    expect(result.canvasWidth * result.canvasHeight).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(Math.max(result.canvasWidth, result.canvasHeight)).toBeLessThanOrEqual(8192);
  });
});

describe("canvas backing store limits", () => {
  it("keeps the page geometry when a panorama exceeds the browser canvas axis", () => {
    expect(getCanvasRenderDimensions(15_000, 90, 5)).toEqual({
      cssWidth: 15_000,
      cssHeight: 90,
      canvasWidth: 8192,
      canvasHeight: 49,
      outputScale: 8192 / 15_000,
    });
  });

  it("caps canvas area independently of its longest axis", () => {
    expect(getCanvasRenderDimensions(3000, 3000, 2)).toEqual({
      cssWidth: 3000,
      cssHeight: 3000,
      canvasWidth: 4096,
      canvasHeight: 4096,
      outputScale: 4096 / 3000,
    });
  });
});

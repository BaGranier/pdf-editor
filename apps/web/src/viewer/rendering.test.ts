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

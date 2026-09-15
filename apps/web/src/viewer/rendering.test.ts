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

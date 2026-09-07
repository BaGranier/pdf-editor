import { describe, expect, it } from "vitest";
import { normalizeSelectionClientRects, selectionClientRectsToPdfRects } from "./selectionGeometry";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height });
const viewport = { convertToPdfPoint: (x: number, y: number) => [x / 2, 500 - y / 2] } as never;

describe("selectionGeometry", () => {
  it("filters tiny fragments and merges adjacent fragments on the same line", () => {
    expect(normalizeSelectionClientRects([rect(10, 20, 30, 12), rect(41, 20, 20, 12), rect(1, 1, .5, 10)])).toEqual([rect(10, 20, 51, 12)]);
  });
  it("keeps separate lines and converts client coordinates relative to the page", () => {
    expect(selectionClientRectsToPdfRects([rect(110, 220, 40, 20), rect(110, 250, 30, 20)], { left: 100, top: 200 }, viewport)).toEqual([{ x0: 5, y0: 480, x1: 25, y1: 490 }, { x0: 5, y0: 465, x1: 20, y1: 475 }]);
  });
  it("keeps PDF coordinates invariant when equivalent selections use different zooms", () => {
    const expected = [{ x0: 10, y0: 460, x1: 40, y1: 480 }];
    for (const zoom of [0.5, 1, 1.5]) {
      const scaledViewport = { convertToPdfPoint: (x: number, y: number) => [x / zoom, 500 - y / zoom] } as never;
      expect(selectionClientRectsToPdfRects([rect(10 * zoom, 20 * zoom, 30 * zoom, 20 * zoom)], { left: 0, top: 0 }, scaledViewport)).toEqual(expected);
    }
  });
});

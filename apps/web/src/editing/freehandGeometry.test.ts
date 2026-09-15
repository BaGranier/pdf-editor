import { describe, expect, it } from "vitest";
import { getFreehandHitTolerance, isPointNearFreehand, translateFreehandByScreenDelta } from "./freehandGeometry";
import type { PdfViewport } from "./coordinates";
import type { FreehandEdit } from "./types";

const edit: FreehandEdit = {
  id: "freehand-1", type: "freehand", page: 1,
  rect: { x0: 10, y0: 10, x1: 30, y1: 20 },
  points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 10 }],
  style: { color: "#2563eb", strokeWidth: 2, opacity: 1 },
};

function viewport(scale: number): PdfViewport {
  return {
    viewBox: [0, 0, 100, 100],
    transform: [scale, 0, 0, -scale, 0, 100 * scale],
    convertToPdfPoint: (x, y) => [x / scale, 100 - y / scale],
    convertToViewportPoint: (x, y) => [x * scale, (100 - y) * scale],
  } as PdfViewport;
}

describe("freehandGeometry", () => {
  it("hits segments, including nearby points, but not an empty area inside the bounding box", () => {
    expect(isPointNearFreehand(edit, { x: 15, y: 15 }, 1)).toBe(true);
    expect(isPointNearFreehand(edit, { x: 15, y: 16 }, 1.1)).toBe(true);
    expect(isPointNearFreehand(edit, { x: 20, y: 12 }, 1)).toBe(false);
  });

  it.each([0.5, 1, 1.5])("keeps screen selection tolerance usable at %sx zoom", (scale) => {
    const tolerance = getFreehandHitTolerance(viewport(scale), edit.style.strokeWidth);
    expect(tolerance * scale).toBeGreaterThanOrEqual(6);
  });

  it("translates all points and the rect uniformly in PDF coordinates", () => {
    const moved = translateFreehandByScreenDelta(viewport(1), edit, { x: 5, y: -7 });
    expect(moved.points).toEqual([{ x: 15, y: 17 }, { x: 25, y: 27 }, { x: 35, y: 17 }]);
    expect(moved.rect).toEqual({ x0: 15, y0: 17, x1: 35, y1: 27 });
  });
});

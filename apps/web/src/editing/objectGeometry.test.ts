import { describe, expect, it } from "vitest";
import { arrowHead, constrainSquare, initialImageRect } from "./objectGeometry";
import { resizeFreeformPdfRectByScreenDelta } from "./coordinates";

describe("added object geometry", () => {
  it.each([0.5, 1, 1.5, 2])("constrains square resize in PDF points at zoom %s", (zoom) => {
    const viewport = { transform: [zoom, 0, 0, -zoom, 0, 800 * zoom], convertToViewportPoint: (x: number, y: number) => [x * zoom, (800 - y) * zoom], viewBox: [0, 0, 600, 800], convertToPdfPoint: (x: number, y: number) => [x / zoom, 800 - y / zoom] };
    const original = { x0: 100, y0: 400, x1: 200, y1: 500 };
    for (const handle of ["nw", "ne", "sw", "se"] as const) {
      const rect = constrainSquare(resizeFreeformPdfRectByScreenDelta(viewport, original, { x: 70 * zoom, y: -15 * zoom }, handle, 12, 12), handle);
      expect(rect.x1 - rect.x0).toBe(rect.y1 - rect.y0);
      expect(rect.x1).toBeLessThanOrEqual(600);
      expect(rect.y0).toBeGreaterThanOrEqual(0);
    }
  });
  it.each([[100, 50], [8000, 1000], [60, 8000]])("fits and centers an image %s × %s", (width, height) => {
    const rect = initialImageRect([10, 20, 610, 820], width, height);
    expect((rect.x1 - rect.x0) / (rect.y1 - rect.y0)).toBeCloseTo(width / height);
    expect(rect.x0).toBeGreaterThanOrEqual(10);
    expect(rect.y0).toBeGreaterThanOrEqual(20);
    expect(rect.x1).toBeLessThanOrEqual(610);
    expect(rect.y1).toBeLessThanOrEqual(820);
    expect((rect.x1 + rect.x0) / 2).toBe(310);
  });
  it("makes a one-pixel image manipulable without changing its ratio", () => {
    const rect = initialImageRect([0, 0, 600, 800], 1, 2);
    expect(rect.x1 - rect.x0).toBe(30);
    expect(rect.y1 - rect.y0).toBe(60);
  });
  it.each([[100, 0], [0, 100], [-100, 100], [1, 1], [0, 0]])("arrow follows endpoint %s,%s without NaN", (x, y) => {
    for (const width of [1, 3, 15]) {
      const points = arrowHead({ x: 0, y: 0 }, { x, y }, width);
      expect(points[1]).toEqual({ x, y });
      expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(Math.hypot(points[0].x - x, points[0].y - y)).toBeLessThanOrEqual(Math.hypot(x, y));
    }
  });
});

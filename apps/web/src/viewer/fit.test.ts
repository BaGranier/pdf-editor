import { describe, expect, it } from "vitest";
import { computeFitScale } from "./fit";

describe("computeFitScale", () => {
  it("fits portrait pages to the limiting height", () => {
    expect(computeFitScale({ pageWidth: 800, pageHeight: 1000, containerWidth: 1200, containerHeight: 900, padding: 20 })).toBe(0.86);
  });

  it("fits landscape pages to the limiting width", () => {
    expect(computeFitScale({ pageWidth: 1200, pageHeight: 800, containerWidth: 900, containerHeight: 1200, padding: 20 })).toBeCloseTo(0.7167, 4);
  });

  it("respects scale bounds for small and large containers", () => {
    expect(computeFitScale({ pageWidth: 800, pageHeight: 1000, containerWidth: 100, containerHeight: 100, minScale: 0.5 })).toBe(0.5);
    expect(computeFitScale({ pageWidth: 100, pageHeight: 100, containerWidth: 2000, containerHeight: 2000, maxScale: 4 })).toBe(4);
  });
});

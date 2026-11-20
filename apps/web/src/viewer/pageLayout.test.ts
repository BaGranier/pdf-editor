import { describe, expect, it } from "vitest";
import { facingSpreadSize, isMultipageMode, isScrollingMode } from "./pageLayout";

describe("page layouts", () => {
  it("fits both columns across mixed portrait and landscape rows", () => {
    expect(facingSpreadSize([
      { width: 500, height: 320 }, { width: 300, height: 600 },
      { width: 250, height: 510 }, { width: 560, height: 400 },
      { width: 410, height: 700 },
    ])).toEqual({ width: 1060, height: 700 });
    expect(facingSpreadSize([{ width: 320, height: 450 }])).toEqual({ width: 320, height: 450 });
  });

  it("uses a scrolling render window for both multipage modes and Continu", () => {
    for (const mode of ["facing", "adaptive"]) {
      expect(isMultipageMode(mode)).toBe(true);
      expect(isScrollingMode(mode)).toBe(true);
    }
    expect(isScrollingMode("continuous")).toBe(true);
    expect(isScrollingMode("single-page")).toBe(false);
    expect(isScrollingMode("presentation")).toBe(false);
  });
});

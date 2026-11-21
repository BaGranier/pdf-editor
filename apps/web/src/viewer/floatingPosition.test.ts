import { describe, expect, it } from "vitest";
import { floatingPosition } from "./floatingPosition";

describe("floating surfaces", () => {
  it("flips at the right edge and shifts above the bottom edge", () => {
    expect(floatingPosition(
      { left: 460, right: 490, top: 360, width: 30, height: 24 },
      { width: 180, height: 90 }, { width: 500, height: 400 }, "right-center",
    )).toEqual({ left: 272, top: 302 });
  });

  it("shifts a panel horizontally when it fits on neither side", () => {
    expect(floatingPosition(
      { left: 8, right: 64, top: 5, width: 56, height: 26 },
      { width: 104, height: 100 }, { width: 120, height: 170 }, "right-start",
    )).toEqual({ left: 8, top: 8 });
  });

  it("places an end-aligned menu above a bottom anchor in the visual viewport", () => {
    expect(floatingPosition(
      { left: 400, right: 480, top: 390, width: 80, height: 30 },
      { width: 200, height: 112 }, { width: 440, height: 360, left: 35, top: 75 }, "bottom-end",
    )).toEqual({ left: 267, top: 270 });
  });

  it("puts a text selection toolbar below when the upper edge lacks room", () => {
    expect(floatingPosition(
      { left: 0, right: 50, top: 5, width: 50, height: 10 },
      { width: 220, height: 45 }, { width: 480, height: 350 }, "top-center",
    )).toEqual({ left: 8, top: 23 });
  });
});

import { describe, expect, it } from "vitest";
import { sidePanelPosition } from "./floatingPosition";

describe("sidebar floating panels", () => {
  it("flips at the right edge and shifts above the bottom edge", () => {
    expect(sidePanelPosition(
      { left: 460, right: 490, top: 360, height: 24 },
      { width: 180, height: 90 }, { width: 500, height: 400 }, true,
    )).toEqual({ left: 272, top: 302 });
  });
  it("shifts a panel horizontally in a viewport too narrow to fit either side", () => {
    expect(sidePanelPosition(
      { left: 8, right: 64, top: 5, height: 26 },
      { width: 104, height: 100 }, { width: 120, height: 170 }, false,
    )).toEqual({ left: 8, top: 8 });
  });
});

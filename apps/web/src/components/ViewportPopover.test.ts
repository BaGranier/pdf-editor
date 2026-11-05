import { describe, expect, it } from "vitest";
import { placePopover } from "./ViewportPopover";

describe("viewport popover collisions", () => {
  it.each([
    [1440, 960, 200, 100, 140, 208, 180],
    [320, 240, 300, 20, 60, 208, 180],
    [800, 600, 750, 540, 580, 208, 180],
    [320, 100, -20, 40, 80, 600, 700],
  ])("keeps measured content inside %sx%s", (vw, vh, left, top, bottom, width, height) => {
    const placement = placePopover({ left, top, bottom }, width, height, vw, vh);
    expect(placement.left).toBeGreaterThanOrEqual(8);
    expect(placement.top).toBeGreaterThanOrEqual(8);
    expect(placement.left + Math.min(width, placement.maxWidth)).toBeLessThanOrEqual(vw - 8);
    expect(placement.top + Math.min(height, placement.maxHeight)).toBeLessThanOrEqual(vh - 8);
  });

  it("prefers below and flips above when there is room", () => {
    expect(placePopover({ left: 20, top: 100, bottom: 120 }, 200, 150, 800, 600).top).toBe(126);
    expect(placePopover({ left: 20, top: 500, bottom: 520 }, 200, 150, 800, 600).top).toBe(344);
  });
});

import { describe, expect, it } from "vitest";
import {
  CONTINUOUS_RENDER_BUFFER_PAGES,
  getContinuousRenderWindow,
} from "./continuousRenderWindow";

describe("getContinuousRenderWindow", () => {
  it("keeps a bounded buffer around the visible page", () => {
    expect([...getContinuousRenderWindow(250, [125])]).toEqual([123, 124, 125, 126, 127]);
  });

  it("keeps every currently visible page and clamps the range at document edges", () => {
    expect([...getContinuousRenderWindow(250, [1, 2])]).toEqual([1, 2, 3, 4]);
    expect([...getContinuousRenderWindow(250, [249, 250])]).toEqual([247, 248, 249, 250]);
  });

  it("does not fill hundreds of pages during a direct jump", () => {
    expect([...getContinuousRenderWindow(250, [1, 250])]).toEqual([1, 2, 3, 248, 249, 250]);
  });

  it("does not materialize pages outside a document", () => {
    expect([...getContinuousRenderWindow(3, [0, 4, 2], 1)]).toEqual([1, 2, 3]);
    expect(getContinuousRenderWindow(0, [1])).toEqual(new Set());
    expect(CONTINUOUS_RENDER_BUFFER_PAGES).toBeGreaterThan(0);
  });
});

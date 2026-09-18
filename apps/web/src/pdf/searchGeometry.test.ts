import { describe, expect, it } from "vitest";
import { createSearchRange } from "./searchGeometry";

describe("search text-layer geometry", () => {
  it("maps a match in the middle of one text span", () => {
    const layer = document.createElement("div");
    layer.innerHTML = "<span>https://tinyurl.com/BISIIIenv</span>";
    const range = createSearchRange(layer, 20, 26);
    expect(range?.toString()).toBe("BISIII");
  });

  it("creates one range across adjacent text-layer spans", () => {
    const layer = document.createElement("div");
    layer.innerHTML = "<span>Mont</span><span>parnasse</span>";
    const range = createSearchRange(layer, 0, 12);
    expect(range?.toString()).toBe("Montparnasse");
  });

  it("keeps repeated occurrences separate", () => {
    const layer = document.createElement("div");
    layer.innerHTML = "<span>init init</span>";
    expect(createSearchRange(layer, 0, 4)?.toString()).toBe("init");
    expect(createSearchRange(layer, 5, 9)?.toString()).toBe("init");
  });
});

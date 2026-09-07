import { describe, expect, it } from "vitest";
import type { TextMarkupEdit } from "../editing/types";
import { findTextMarkupAtPoint } from "./textMarkupHitTest";

const highlight: TextMarkupEdit = { id: "highlight", type: "text_markup", kind: "highlight", page: 1, color: "#eab308", rect: { x0: 10, y0: 10, x1: 80, y1: 30 }, rects: [{ x0: 10, y0: 10, x1: 80, y1: 30 }] };
const underline: TextMarkupEdit = { id: "underline", type: "text_markup", kind: "underline", page: 1, color: "#2563eb", rect: { x0: 10, y0: 40, x1: 80, y1: 60 }, rects: [{ x0: 10, y0: 40, x1: 80, y1: 60 }] };

describe("findTextMarkupAtPoint", () => {
  it("finds highlights only on their PDF page", () => {
    expect(findTextMarkupAtPoint([highlight], 1, { x: 30, y: 20 })?.id).toBe("highlight");
    expect(findTextMarkupAtPoint([highlight], 2, { x: 30, y: 20 })).toBeNull();
  });

  it("uses a tolerance around thin underline segments", () => {
    expect(findTextMarkupAtPoint([underline], 1, { x: 45, y: 42 })?.id).toBe("underline");
    expect(findTextMarkupAtPoint([underline], 1, { x: 45, y: 52 })).toBeNull();
  });
});

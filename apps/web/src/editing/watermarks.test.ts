import { describe, expect, it } from "vitest";
import { createWatermark, DEFAULT_WATERMARK, watermarkPages } from "./watermarks";
import { layoutStamp } from "./stampLayout";
import { pdfEditsReducer } from "./state";

describe("full page non-destructive watermarks", () => {
  it("validates page/range/all scopes before expansion", () => {
    expect(watermarkPages("range", "1-3, 5, 8-10, 2", 1, 10)).toEqual([1, 2, 3, 5, 8, 9, 10]);
    expect(watermarkPages("all", "", 1, 3)).toEqual([1, 2, 3]);
    expect(watermarkPages("page", "", 2, 3)).toEqual([2]);
    for (const range of ["0", "3-2", "1-4", "1,,2", "", "-1", "1e2"]) expect(() => watermarkPages("range", range, 1, 3)).toThrow();
  });
  it.each([[595, 842], [842, 595], [400, 400]])("fits a giant rotated inscription on %s by %s pages", (width, height) => {
    const edit = createWatermark(1, { x0: 0, y0: 0, x1: width, y1: height }, DEFAULT_WATERMARK, "group");
    const layout = layoutStamp(edit, width, height);
    expect(edit).toMatchObject({ purpose: "watermark", opacity: 0.25, rotation: -45, border: false, fillOpacity: 0 });
    expect(layout.overflow).toBe(false);
    expect(layout.lines[0].advance).toBeGreaterThan(Math.min(width, height));
    expect(layoutStamp({ ...edit, rotation: 45 }, width, height).fontSize).toBeCloseTo(layout.fontSize);
    expect(layoutStamp({ ...edit, offsetX: 0.1 }, width, height).overflow).toBe(false);
  });
  it("groups insertion, property changes and deletion into single undo steps", () => {
    const edits = [1, 2, 3].map((page) => createWatermark(page, { x0: 0, y0: 0, x1: 400, y1: 600 }, DEFAULT_WATERMARK, "group"));
    let state = pdfEditsReducer({}, { type: "batch", documentId: "doc", add: edits });
    expect(state.doc.past).toHaveLength(1);
    for (const opacity of [0.3, 0.4, 0.5]) state = pdfEditsReducer(state, { type: "batch", documentId: "doc", replace: edits.map((edit) => ({ ...edit, opacity })), coalesceKey: "opacity" });
    expect(state.doc.past).toHaveLength(2);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(state.doc.edits).toEqual(edits);
    state = pdfEditsReducer(state, { type: "batch", documentId: "doc", deleteIds: edits.map((edit) => edit.id) });
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(JSON.parse(JSON.stringify(state.doc.edits))).toEqual(edits);
  });
});

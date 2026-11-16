import { describe, expect, it } from "vitest";
import { pdfEditsReducer } from "./state";
import type { RedactionEdit } from "./types";

describe("redaction history and persistence", () => {
  it("restores a pending zone through undo/redo and legacy hydration", () => {
    const edit: RedactionEdit = { id: "r", type: "redaction", page: 2, rect: { x0: 10, y0: 20, x1: 40, y1: 50 } };
    let state = pdfEditsReducer({}, { type: "hydrate", documentId: "doc", edits: [] });
    state = pdfEditsReducer(state, { type: "add", documentId: "doc", edit });
    expect(state.doc.isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(state.doc.edits).toEqual([]);
    expect(state.doc.isDirty).toBe(false);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc" });
    state = pdfEditsReducer(state, { type: "delete", documentId: "doc", editId: "r" });
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(JSON.parse(JSON.stringify(state.doc.edits))).toEqual([edit]);
  });
});

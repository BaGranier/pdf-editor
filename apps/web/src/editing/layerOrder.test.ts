import { describe, expect, it } from "vitest";
import { getDocumentEditingState, pdfEditsReducer } from "./state";
import type { PdfEdit } from "./types";

const objects: PdfEdit[] = [
  { id: "image", type: "image", imageId: "asset", page: 1, rect: { x0: 0, y0: 0, x1: 100, y1: 50 } },
  { id: "shape", type: "shape", shapeType: "rectangle", page: 1, rect: { x0: 0, y0: 0, x1: 100, y1: 50 }, style: { strokeColor: "#000000", strokeWidth: 2, fillColor: "#ff0000", opacity: 0.5 } },
  { id: "other-page", type: "signature", imageId: "asset", page: 2, rect: { x0: 0, y0: 0, x1: 100, y1: 50 } },
  { id: "text", type: "add_text", text: "above", page: 1, rect: { x0: 0, y0: 0, x1: 100, y1: 50 }, style: { fontFamily: "Helvetica", fontSize: 12, bold: false, color: "#000000" } },
];

describe("array order and image history", () => {
  it.each([ ["front", "image", ["shape", "text", "image"]], ["back", "text", ["text", "image", "shape"]], ["forward", "image", ["shape", "image", "text"]], ["backward", "text", ["image", "text", "shape"]] ] as const)("%s is undoable and leaves other pages in place", (direction, editId, expected) => {
    const initial = pdfEditsReducer({}, { type: "hydrate", documentId: "doc", edits: objects });
    expect(getDocumentEditingState(initial, "doc").isDirty).toBe(false);
    const changed = pdfEditsReducer(initial, { type: "reorder", documentId: "doc", direction, editId });
    const state = getDocumentEditingState(changed, "doc");
    expect(state.edits.filter((e) => e.page === 1).map((e) => e.id)).toEqual(expected);
    expect(state.edits[2].id).toBe("other-page");
    expect(state.isDirty).toBe(true);
    const undone = pdfEditsReducer(changed, { type: "undo", documentId: "doc" });
    expect(getDocumentEditingState(undone, "doc").edits).toEqual(objects);
    expect(getDocumentEditingState(undone, "doc").isDirty).toBe(false);
    expect(getDocumentEditingState(pdfEditsReducer(undone, { type: "redo", documentId: "doc" }), "doc").edits).toEqual(state.edits);
  });
  it("retains image assets by reference through add/move/delete and does not clean edits made during export", () => {
    let state = pdfEditsReducer({}, { type: "add", documentId: "doc", edit: objects[0] });
    const savedRevision = getDocumentEditingState(state, "doc").revision;
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc", edit: { ...objects[0], rect: { x0: 20, y0: 30, x1: 120, y1: 80 } } });
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc", revision: savedRevision });
    expect(getDocumentEditingState(state, "doc").isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "delete", documentId: "doc", editId: "image" });
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(getDocumentEditingState(state, "doc").edits[0]).toMatchObject({ type: "image", imageId: "asset", rect: { x0: 20 } });
    expect(getDocumentEditingState(state, "doc").past).toHaveLength(2);
  });
  it("keeps coalesced changes and page changes dirty when an earlier export finishes", () => {
    let state = pdfEditsReducer({}, { type: "add", documentId: "doc", edit: objects[0] });
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc", coalesceKey: "drag", edit: { ...objects[0], rect: { x0: 1, y0: 0, x1: 101, y1: 50 } } });
    const snapshot = getDocumentEditingState(state, "doc");
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc", coalesceKey: "drag", edit: { ...objects[0], rect: { x0: 2, y0: 0, x1: 102, y1: 50 } } });
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc", revision: snapshot.revision, edits: snapshot.edits, externalRevision: snapshot.externalRevision });
    expect(getDocumentEditingState(state, "doc").isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc" });
    state = pdfEditsReducer(state, { type: "mark_dirty", documentId: "doc" });
    const pageSnapshot = getDocumentEditingState(state, "doc");
    state = pdfEditsReducer(state, { type: "mark_dirty", documentId: "doc" });
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc", revision: pageSnapshot.revision, edits: pageSnapshot.edits, externalRevision: pageSnapshot.externalRevision });
    expect(getDocumentEditingState(state, "doc").isDirty).toBe(true);
  });

});

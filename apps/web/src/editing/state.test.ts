import { describe, expect, it } from "vitest";
import {
  getDocumentEditingState,
  pdfEditsReducer,
  type PdfEditsByDocument,
} from "./state";
import type { AddTextEdit, PdfEdit, SignatureEdit } from "./types";

const textEdit: AddTextEdit = {
  id: "text-1",
  type: "add_text",
  page: 1,
  rect: { x0: 10, y0: 10, x1: 100, y1: 40 },
  text: "Texte",
  style: {
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#000000",
    bold: false,
  },
};

const signatureEdit: SignatureEdit = {
  id: "signature-1",
  type: "signature",
  page: 1,
  rect: { x0: 20, y0: 20, x1: 120, y1: 60 },
  imageId: "image-1",
};

function addEdits(documentId: string, edits: PdfEdit[]) {
  return edits.reduce<PdfEditsByDocument>(
    (state, edit) =>
      pdfEditsReducer(state, { type: "add", documentId, edit }),
    {},
  );
}

describe("pdfEditsReducer history", () => {
  it("keeps heterogeneous edits ordered and histories isolated by document", () => {
    let state = addEdits("doc-a", [textEdit, signatureEdit]);
    state = pdfEditsReducer(state, {
      type: "add",
      documentId: "doc-b",
      edit: { ...textEdit, id: "text-b", page: 3 },
    });

    expect(state["doc-a"].edits.map((edit) => edit.type)).toEqual([
      "add_text",
      "signature",
    ]);
    expect(state["doc-b"].edits).toEqual([
      expect.objectContaining({ id: "text-b", page: 3 }),
    ]);

    const undone = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(undone["doc-a"].edits).toEqual([textEdit]);
    expect(undone["doc-b"].edits).toEqual(state["doc-b"].edits);
  });

  it("undoes and redoes creation, replacement, resize and deletion", () => {
    let state = addEdits("doc-a", [textEdit]);
    const moved = {
      ...textEdit,
      rect: { ...textEdit.rect, x0: 25, x1: 115 },
    };
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: moved,
    });
    expect(state["doc-a"].edits[0]).toEqual(moved);

    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits[0]).toEqual(textEdit);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits[0]).toEqual(moved);

    state = pdfEditsReducer(state, {
      type: "delete",
      documentId: "doc-a",
      editId: textEdit.id,
    });
    expect(state["doc-a"].edits).toEqual([]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([moved]);
  });

  it("clears redo after a new edit branch", () => {
    let state = addEdits("doc-a", [textEdit]);
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...textEdit, text: "B" },
    });
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].canRedo).toBe(true);

    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...textEdit, text: "D" },
    });
    expect(state["doc-a"].canRedo).toBe(false);
    expect(state["doc-a"].edits[0]).toEqual({ ...textEdit, text: "D" });
  });

  it("returns to the saved revision as clean and keeps redo across save", () => {
    let state = addEdits("doc-a", [textEdit]);
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc-a" });
    const savedRevision = state["doc-a"].revision;
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...textEdit, style: { ...textEdit.style, bold: true } },
    });
    expect(state["doc-a"].isDirty).toBe(true);

    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"]).toMatchObject({
      revision: savedRevision,
      savedRevision,
      isDirty: false,
      canRedo: true,
    });

    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc-a" });
    expect(state["doc-a"].canRedo).toBe(true);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].isDirty).toBe(true);
  });

  it("does not record no-op replacements and tracks external dirty state", () => {
    let state = addEdits("doc-a", [textEdit, signatureEdit]);
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc-a" });
    const cleanState = state;

    expect(
      pdfEditsReducer(cleanState, {
        type: "replace",
        documentId: "doc-a",
        edit: { ...textEdit, rect: { ...textEdit.rect } },
      }),
    ).toBe(cleanState);
    expect(
      pdfEditsReducer(cleanState, {
        type: "delete",
        documentId: "doc-a",
        editId: "missing",
      }),
    ).toBe(cleanState);

    state = pdfEditsReducer(cleanState, {
      type: "mark_dirty",
      documentId: "doc-a",
    });
    expect(state["doc-a"].isDirty).toBe(true);
    expect(getDocumentEditingState(state, "doc-b")).toMatchObject({
      edits: [],
      isDirty: false,
      canUndo: false,
      canRedo: false,
    });
  });
});

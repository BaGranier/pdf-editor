import { describe, expect, it } from "vitest";
import {
  getDocumentEditingState,
  pdfEditsReducer,
  type PdfEditsByDocument,
} from "./state";
import type { AddTextEdit, FreehandEdit, PdfEdit, ShapeEdit, SignatureEdit, TextMarkupEdit } from "./types";

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

const shapeEdit: ShapeEdit = {
  id: "shape-1",
  type: "shape",
  shapeType: "rectangle",
  page: 1,
  rect: { x0: 30, y0: 30, x1: 130, y1: 90 },
  style: {
    strokeColor: "#123456",
    strokeWidth: 2,
    fillColor: null,
  },
};

const textMarkupEdit: TextMarkupEdit = {
  id: "markup-1",
  type: "text_markup",
  kind: "highlight",
  page: 1,
  rect: { x0: 10, y0: 40, x1: 120, y1: 80 },
  rects: [
    { x0: 10, y0: 60, x1: 120, y1: 80 },
    { x0: 10, y0: 40, x1: 100, y1: 55 },
  ],
  color: "#eab308",
};

const freehandEdit: FreehandEdit = {
  id: "freehand-1",
  type: "freehand",
  page: 1,
  rect: { x0: 20, y0: 20, x1: 90, y1: 90 },
  points: [{ x: 20, y: 20 }, { x: 90, y: 90 }],
  style: { color: "#2563eb", strokeWidth: 3, opacity: 1 },
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

  it("tracks shape geometry and visual property changes in the shared history", () => {
    let state = addEdits("doc-a", [shapeEdit]);
    const styledShape = {
      ...shapeEdit,
      style: { ...shapeEdit.style, fillColor: "#abcdef", strokeWidth: 4 },
    };
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: styledShape,
    });
    expect(state["doc-a"].edits).toEqual([styledShape]);

    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([shapeEdit]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([styledShape]);
  });

  it("tracks a multi-line text markup as one dirty undoable operation", () => {
    let state = addEdits("doc-a", [textMarkupEdit]);
    expect(state["doc-a"].isDirty).toBe(true);
    const recolored = { ...textMarkupEdit, color: "#dc2626" };
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc-a", edit: recolored });
    state = pdfEditsReducer(state, { type: "delete", documentId: "doc-a", editId: textMarkupEdit.id });
    expect(state["doc-a"].edits).toEqual([]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([recolored]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([textMarkupEdit]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([textMarkupEdit]);
  });

  it("coalesces a slider drag into one dirty undoable freehand update", () => {
    let state = addEdits("doc-a", [freehandEdit]);
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc-a" });
    const key = "freehand-1:opacity";
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...freehandEdit, style: { ...freehandEdit.style, opacity: 0.5 } },
      coalesceKey: key,
    });
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...freehandEdit, style: { ...freehandEdit.style, opacity: 0.35 } },
      coalesceKey: key,
    });
    state = pdfEditsReducer(state, { type: "finish_coalescing", documentId: "doc-a", coalesceKey: key });

    expect(state["doc-a"].isDirty).toBe(true);
    expect(state["doc-a"].past).toHaveLength(2);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([freehandEdit]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits[0]).toMatchObject({ style: { opacity: 0.35 } });
  });
});

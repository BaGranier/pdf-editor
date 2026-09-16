import { describe, expect, it } from "vitest";
import {
  getDocumentEditingState,
  pdfEditsReducer,
  type PdfEditsByDocument,
} from "./state";
import type { AddTextEdit, FreehandEdit, NativeTextEdit, PdfCommentEdit, PdfEdit, ShapeEdit, SignatureEdit, TextMarkupEdit } from "./types";

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

const commentEdit: PdfCommentEdit = {
  id: "comment-1", type: "comment", commentType: "text", page: 1,
  rect: { x0: 20, y0: 20, x1: 38, y1: 38 }, content: "À revoir", source: "local",
};

const nativeTextEdit: NativeTextEdit = {
  id: "native-1", type: "native_text", page: 1,
  rect: { x0: 40, y0: 100, x1: 180, y1: 120 }, text: "Montant : 1 375 €",
  source: {
    sourceId: "p0-b0-l0-s0", sourceText: "Montant : 1 250 €",
    sourceBBox: { x0: 40, y0: 100, x1: 180, y1: 120 }, sourceOrigin: { x: 40, y: 103 },
    sourceFontName: "Helvetica", sourceFontSize: 11, sourceColor: "#111827",
    sourceRotation: 0, sourceFingerprint: "a".repeat(64), editable: true,
  },
  style: { fontFamily: "Helvetica", fontRef: "pdf-standard:helvetica:400:normal", fontSize: 11, color: "#111827", bold: false, fontStyle: "normal" },
};

function addEdits(documentId: string, edits: PdfEdit[]) {
  return edits.reduce<PdfEditsByDocument>(
    (state, edit) =>
      pdfEditsReducer(state, { type: "add", documentId, edit }),
    {},
  );
}

describe("pdfEditsReducer history", () => {
  it("tracks a native text replacement as one dirty undoable mutation", () => {
    let state = pdfEditsReducer({}, { type: "add", documentId: "doc-a", edit: nativeTextEdit });
    expect(getDocumentEditingState(state, "doc-a").isDirty).toBe(true);
    expect(state["doc-a"].edits[0]).toEqual(expect.objectContaining({ type: "native_text", text: "Montant : 1 375 €" }));
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([]);
    expect(state["doc-a"].isDirty).toBe(false);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([nativeTextEdit]);
  });
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
      style: { ...shapeEdit.style, fillColor: "#abcdef", strokeWidth: 4, opacity: 0.5 },
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

  it("hydrates imported comments without dirtying then tracks local comment edits", () => {
    let state = pdfEditsReducer({}, { type: "hydrate", documentId: "doc-a", edits: [{ ...commentEdit, id: "source-comment", source: "pdf" }] });
    expect(state["doc-a"].isDirty).toBe(false);
    state = pdfEditsReducer(state, { type: "add", documentId: "doc-a", edit: commentEdit });
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc-a", edit: { ...commentEdit, content: "Mis à jour" } });
    state = pdfEditsReducer(state, { type: "delete", documentId: "doc-a", editId: commentEdit.id });
    expect(state["doc-a"].isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toContainEqual({ ...commentEdit, content: "Mis à jour" });
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

  it("coalesces a shape opacity drag and treats missing opacity as fully opaque", () => {
    let state = addEdits("doc-a", [shapeEdit]);
    state = pdfEditsReducer(state, { type: "mark_saved", documentId: "doc-a" });
    const key = "shape-1:opacity";
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...shapeEdit, style: { ...shapeEdit.style, opacity: 0.5 } },
      coalesceKey: key,
    });
    state = pdfEditsReducer(state, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...shapeEdit, style: { ...shapeEdit.style, opacity: 0.35 } },
      coalesceKey: key,
    });
    state = pdfEditsReducer(state, { type: "finish_coalescing", documentId: "doc-a", coalesceKey: key });

    expect(state["doc-a"].isDirty).toBe(true);
    expect(state["doc-a"].past).toHaveLength(2);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc-a" });
    expect(state["doc-a"].edits).toEqual([shapeEdit]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc-a" });
    expect(state["doc-a"].edits[0]).toMatchObject({ style: { opacity: 0.35 } });
  });
});

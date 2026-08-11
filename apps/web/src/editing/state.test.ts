import { describe, expect, it } from "vitest";
import { getDocumentEditingState, pdfEditsReducer } from "./state";
import type { AddTextEdit, SignatureEdit } from "./types";

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

describe("pdfEditsReducer", () => {
  it("keeps heterogeneous edits ordered and isolated by document", () => {
    let state = pdfEditsReducer({}, {
      type: "add",
      documentId: "doc-a",
      edit: textEdit,
    });
    state = pdfEditsReducer(state, {
      type: "add",
      documentId: "doc-a",
      edit: signatureEdit,
    });
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
    expect(state["doc-a"].isDirty).toBe(true);
    expect(state["doc-b"].isDirty).toBe(true);
  });

  it("replaces without changing stacking order and supports deletion", () => {
    const initial = {
      "doc-a": { edits: [textEdit, signatureEdit], isDirty: false },
    };
    const updatedText = { ...textEdit, text: "Texte modifié" };
    const replaced = pdfEditsReducer(initial, {
      type: "replace",
      documentId: "doc-a",
      edit: updatedText,
    });

    expect(replaced["doc-a"]).toEqual({
      edits: [updatedText, signatureEdit],
      isDirty: true,
    });
    expect(
      pdfEditsReducer(replaced, {
        type: "delete",
        documentId: "doc-a",
        editId: signatureEdit.id,
      })["doc-a"].edits,
    ).toEqual([updatedText]);
  });

  it("marks only effective edit mutations as dirty and can mark a document saved", () => {
    const cleanState = {
      "doc-a": { edits: [textEdit, signatureEdit], isDirty: false },
    };

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

    const moved = pdfEditsReducer(cleanState, {
      type: "replace",
      documentId: "doc-a",
      edit: { ...textEdit, rect: { ...textEdit.rect, x0: 12 } },
    });
    expect(moved["doc-a"].isDirty).toBe(true);

    const saved = pdfEditsReducer(moved, {
      type: "mark_saved",
      documentId: "doc-a",
    });
    expect(saved["doc-a"].isDirty).toBe(false);
    expect(saved["doc-a"].edits).toEqual(moved["doc-a"].edits);

    const textMutations: AddTextEdit[] = [
      { ...textEdit, text: "Autre texte" },
      { ...textEdit, style: { ...textEdit.style, fontSize: 18 } },
      { ...textEdit, style: { ...textEdit.style, fontFamily: "Times" } },
      { ...textEdit, style: { ...textEdit.style, color: "#123456" } },
      { ...textEdit, style: { ...textEdit.style, bold: true } },
    ];
    textMutations.forEach((edit) => {
      expect(
        pdfEditsReducer(cleanState, {
          type: "replace",
          documentId: "doc-a",
          edit,
        })["doc-a"].isDirty,
      ).toBe(true);
    });

    expect(
      pdfEditsReducer(cleanState, {
        type: "replace",
        documentId: "doc-a",
        edit: {
          ...signatureEdit,
          rect: { ...signatureEdit.rect, x1: 140, y1: 70 },
        },
      })["doc-a"].isDirty,
    ).toBe(true);
  });

  it("tracks explicit non-edit document changes without affecting other documents", () => {
    const state = pdfEditsReducer({}, {
      type: "mark_dirty",
      documentId: "doc-a",
    });

    expect(getDocumentEditingState(state, "doc-a").isDirty).toBe(true);
    expect(getDocumentEditingState(state, "doc-b")).toEqual({
      edits: [],
      isDirty: false,
    });
  });
});

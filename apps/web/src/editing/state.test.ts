import { describe, expect, it } from "vitest";
import { pdfEditsReducer } from "./state";
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

    expect(state["doc-a"].map((edit) => edit.type)).toEqual([
      "add_text",
      "signature",
    ]);
    expect(state["doc-b"]).toEqual([
      expect.objectContaining({ id: "text-b", page: 3 }),
    ]);
  });

  it("replaces without changing stacking order and supports deletion", () => {
    const initial = { "doc-a": [textEdit, signatureEdit] };
    const updatedText = { ...textEdit, text: "Texte modifié" };
    const replaced = pdfEditsReducer(initial, {
      type: "replace",
      documentId: "doc-a",
      edit: updatedText,
    });

    expect(replaced["doc-a"]).toEqual([updatedText, signatureEdit]);
    expect(
      pdfEditsReducer(replaced, {
        type: "delete",
        documentId: "doc-a",
        editId: signatureEdit.id,
      })["doc-a"],
    ).toEqual([updatedText]);
  });
});

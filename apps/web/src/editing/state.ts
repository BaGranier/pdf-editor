import type { PdfEdit } from "./types";

export type PdfEditsByDocument = Record<string, PdfEdit[]>;

export type PdfEditsAction =
  | { type: "add"; documentId: string; edit: PdfEdit }
  | { type: "replace"; documentId: string; edit: PdfEdit }
  | { type: "delete"; documentId: string; editId: string }
  | { type: "remove_document"; documentId: string }
  | { type: "clear" };

export function pdfEditsReducer(
  state: PdfEditsByDocument,
  action: PdfEditsAction,
): PdfEditsByDocument {
  switch (action.type) {
    case "add":
      return {
        ...state,
        [action.documentId]: [...(state[action.documentId] ?? []), action.edit],
      };
    case "replace":
      return {
        ...state,
        [action.documentId]: (state[action.documentId] ?? []).map((edit) =>
          edit.id === action.edit.id ? action.edit : edit,
        ),
      };
    case "delete":
      return {
        ...state,
        [action.documentId]: (state[action.documentId] ?? []).filter(
          (edit) => edit.id !== action.editId,
        ),
      };
    case "remove_document": {
      const { [action.documentId]: _removed, ...remaining } = state;
      return remaining;
    }
    case "clear":
      return {};
  }
}

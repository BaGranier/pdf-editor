import type { PdfEdit } from "./types";

export type DocumentEditingState = {
  edits: PdfEdit[];
  isDirty: boolean;
};

export type PdfEditsByDocument = Record<string, DocumentEditingState>;

export type PdfEditsAction =
  | { type: "add"; documentId: string; edit: PdfEdit }
  | { type: "replace"; documentId: string; edit: PdfEdit }
  | { type: "delete"; documentId: string; editId: string }
  | { type: "mark_dirty"; documentId: string }
  | { type: "mark_saved"; documentId: string }
  | { type: "remove_document"; documentId: string }
  | { type: "clear" };

const EMPTY_DOCUMENT_EDITING_STATE: DocumentEditingState = {
  edits: [],
  isDirty: false,
};

export function getDocumentEditingState(
  state: PdfEditsByDocument,
  documentId: string,
): DocumentEditingState {
  return state[documentId] ?? EMPTY_DOCUMENT_EDITING_STATE;
}

function editsAreEqual(left: PdfEdit, right: PdfEdit) {
  if (
    left.id !== right.id ||
    left.type !== right.type ||
    left.page !== right.page ||
    left.rect.x0 !== right.rect.x0 ||
    left.rect.y0 !== right.rect.y0 ||
    left.rect.x1 !== right.rect.x1 ||
    left.rect.y1 !== right.rect.y1
  ) {
    return false;
  }

  if (left.type === "signature" && right.type === "signature") {
    return left.imageId === right.imageId;
  }

  if (left.type === "add_text" && right.type === "add_text") {
    return (
      left.text === right.text &&
      left.style.fontFamily === right.style.fontFamily &&
      left.style.fontSize === right.style.fontSize &&
      left.style.color === right.style.color &&
      left.style.bold === right.style.bold
    );
  }

  return false;
}

export function pdfEditsReducer(
  state: PdfEditsByDocument,
  action: PdfEditsAction,
): PdfEditsByDocument {
  switch (action.type) {
    case "add":
      return {
        ...state,
        [action.documentId]: {
          edits: [
            ...getDocumentEditingState(state, action.documentId).edits,
            action.edit,
          ],
          isDirty: true,
        },
      };
    case "replace": {
      const currentDocumentState = getDocumentEditingState(
        state,
        action.documentId,
      );
      const currentEdit = currentDocumentState.edits.find(
        (edit) => edit.id === action.edit.id,
      );

      if (!currentEdit || editsAreEqual(currentEdit, action.edit)) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: {
          edits: currentDocumentState.edits.map((edit) =>
            edit.id === action.edit.id ? action.edit : edit,
          ),
          isDirty: true,
        },
      };
    }
    case "delete": {
      const currentDocumentState = getDocumentEditingState(
        state,
        action.documentId,
      );

      if (!currentDocumentState.edits.some((edit) => edit.id === action.editId)) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: {
          edits: currentDocumentState.edits.filter(
            (edit) => edit.id !== action.editId,
          ),
          isDirty: true,
        },
      };
    }
    case "mark_dirty": {
      const currentDocumentState = getDocumentEditingState(
        state,
        action.documentId,
      );

      if (currentDocumentState.isDirty) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: { ...currentDocumentState, isDirty: true },
      };
    }
    case "mark_saved": {
      const currentDocumentState = getDocumentEditingState(
        state,
        action.documentId,
      );

      if (!currentDocumentState.isDirty) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: { ...currentDocumentState, isDirty: false },
      };
    }
    case "remove_document": {
      const { [action.documentId]: _removed, ...remaining } = state;
      return remaining;
    }
    case "clear":
      return {};
  }
}

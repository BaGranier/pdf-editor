import type { PdfEdit } from "./types";

export type EditingSnapshot = {
  edits: PdfEdit[];
  revision: number;
};

export type DocumentEditingState = {
  edits: PdfEdit[];
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  past: EditingSnapshot[];
  future: EditingSnapshot[];
  revision: number;
  savedRevision: number;
  nextRevision: number;
  externalDirty: boolean;
};

export type PdfEditsByDocument = Record<string, DocumentEditingState>;

export type PdfEditsAction =
  | { type: "add"; documentId: string; edit: PdfEdit }
  | { type: "replace"; documentId: string; edit: PdfEdit }
  | { type: "delete"; documentId: string; editId: string }
  | { type: "undo"; documentId: string }
  | { type: "redo"; documentId: string }
  | { type: "mark_dirty"; documentId: string }
  | { type: "mark_saved"; documentId: string }
  | { type: "remove_document"; documentId: string }
  | { type: "clear" };

const HISTORY_LIMIT = 100;

const EMPTY_DOCUMENT_EDITING_STATE: DocumentEditingState = {
  edits: [],
  isDirty: false,
  canUndo: false,
  canRedo: false,
  past: [],
  future: [],
  revision: 0,
  savedRevision: 0,
  nextRevision: 1,
  externalDirty: false,
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

function withDerivedState(
  state: Omit<DocumentEditingState, "isDirty" | "canUndo" | "canRedo">,
): DocumentEditingState {
  return {
    ...state,
    isDirty: state.externalDirty || state.revision !== state.savedRevision,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}

function commitEdits(
  current: DocumentEditingState,
  edits: PdfEdit[],
): DocumentEditingState {
  const present: EditingSnapshot = {
    edits: current.edits,
    revision: current.revision,
  };
  const past = [...current.past, present].slice(-HISTORY_LIMIT);

  return withDerivedState({
    edits,
    past,
    future: [],
    revision: current.nextRevision,
    savedRevision: current.savedRevision,
    nextRevision: current.nextRevision + 1,
    externalDirty: current.externalDirty,
  });
}

export function pdfEditsReducer(
  state: PdfEditsByDocument,
  action: PdfEditsAction,
): PdfEditsByDocument {
  switch (action.type) {
    case "add": {
      const current = getDocumentEditingState(state, action.documentId);
      return {
        ...state,
        [action.documentId]: commitEdits(current, [...current.edits, action.edit]),
      };
    }
    case "replace": {
      const current = getDocumentEditingState(state, action.documentId);
      const currentEdit = current.edits.find((edit) => edit.id === action.edit.id);

      if (!currentEdit || editsAreEqual(currentEdit, action.edit)) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: commitEdits(
          current,
          current.edits.map((edit) =>
            edit.id === action.edit.id ? action.edit : edit,
          ),
        ),
      };
    }
    case "delete": {
      const current = getDocumentEditingState(state, action.documentId);

      if (!current.edits.some((edit) => edit.id === action.editId)) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: commitEdits(
          current,
          current.edits.filter((edit) => edit.id !== action.editId),
        ),
      };
    }
    case "undo": {
      const current = getDocumentEditingState(state, action.documentId);
      const previous = current.past[current.past.length - 1];

      if (!previous) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: withDerivedState({
          edits: previous.edits,
          past: current.past.slice(0, -1),
          future: [
            { edits: current.edits, revision: current.revision },
            ...current.future,
          ],
          revision: previous.revision,
          savedRevision: current.savedRevision,
          nextRevision: current.nextRevision,
          externalDirty: current.externalDirty,
        }),
      };
    }
    case "redo": {
      const current = getDocumentEditingState(state, action.documentId);
      const [next, ...remainingFuture] = current.future;

      if (!next) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: withDerivedState({
          edits: next.edits,
          past: [
            ...current.past,
            { edits: current.edits, revision: current.revision },
          ].slice(-HISTORY_LIMIT),
          future: remainingFuture,
          revision: next.revision,
          savedRevision: current.savedRevision,
          nextRevision: current.nextRevision,
          externalDirty: current.externalDirty,
        }),
      };
    }
    case "mark_dirty": {
      const current = getDocumentEditingState(state, action.documentId);

      if (current.externalDirty) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: withDerivedState({
          ...current,
          externalDirty: true,
        }),
      };
    }
    case "mark_saved": {
      const current = getDocumentEditingState(state, action.documentId);

      if (!current.isDirty) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: withDerivedState({
          ...current,
          savedRevision: current.revision,
          externalDirty: false,
        }),
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

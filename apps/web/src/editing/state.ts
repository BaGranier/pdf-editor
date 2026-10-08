import { isLayerObject, type LayerDirection } from "./layers";
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
  externalRevision: number;
  coalescingKey: string | null;
};

export type PdfEditsByDocument = Record<string, DocumentEditingState>;

export type PdfEditsAction =
  | { type: "add"; documentId: string; edit: PdfEdit }
  | { type: "hydrate"; documentId: string; edits: PdfEdit[] }
  | { type: "replace"; documentId: string; edit: PdfEdit; coalesceKey?: string }
  | { type: "finish_coalescing"; documentId: string; coalesceKey: string }
  | { type: "delete"; documentId: string; editId: string }
  | { type: "reorder"; documentId: string; editId: string; direction: LayerDirection }
  | { type: "undo"; documentId: string }
  | { type: "redo"; documentId: string }
  | { type: "mark_dirty"; documentId: string }
  | { type: "mark_saved"; documentId: string; revision?: number; edits?: PdfEdit[]; externalRevision?: number }
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
  externalRevision: 0,
  coalescingKey: null,
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

  if ((left.type === "signature" || left.type === "image") && right.type === left.type) {
    return left.imageId === right.imageId && (left.type !== "image" || right.type !== "image" ||
      (JSON.stringify(left.crop) === JSON.stringify(right.crop) && left.aspectLocked === right.aspectLocked));
  }

  if (left.type === "add_text" && right.type === "add_text") {
    return (
      left.text === right.text &&
      left.style.fontFamily === right.style.fontFamily &&
      left.style.fontRef === right.style.fontRef &&
      left.style.fontSize === right.style.fontSize &&
      left.style.color === right.style.color &&
      left.style.bold === right.style.bold &&
      left.style.fontStyle === right.style.fontStyle &&
      left.autoSize === right.autoSize
    );
  }

  if (left.type === "native_text" && right.type === "native_text") {
    return (
      left.text === right.text &&
      left.source.sourceFingerprint === right.source.sourceFingerprint &&
      left.style.fontFamily === right.style.fontFamily &&
      left.style.fontRef === right.style.fontRef &&
      left.style.fontSize === right.style.fontSize &&
      left.style.color === right.style.color &&
      left.style.bold === right.style.bold &&
      left.style.fontStyle === right.style.fontStyle
    );
  }

  if (left.type === "shape" && right.type === "shape") {
    return (
      left.shapeType === right.shapeType &&
      (left.lineStyle ?? "line") === (right.lineStyle ?? "line") &&
      JSON.stringify(left.start) === JSON.stringify(right.start) &&
      JSON.stringify(left.end) === JSON.stringify(right.end) &&
      left.style.strokeColor === right.style.strokeColor &&
      left.style.strokeWidth === right.style.strokeWidth &&
      left.style.fillColor === right.style.fillColor &&
      (left.style.opacity ?? 1) === (right.style.opacity ?? 1)
    );
  }

  if (left.type === "freehand" && right.type === "freehand") {
    return left.style.color === right.style.color && left.style.strokeWidth === right.style.strokeWidth && (left.style.opacity ?? 1) === (right.style.opacity ?? 1) && JSON.stringify(left.points) === JSON.stringify(right.points);
  }

  if (left.type === "text_markup" && right.type === "text_markup") {
    return left.kind === right.kind && left.color === right.color && JSON.stringify(left.rects) === JSON.stringify(right.rects);
  }

  if (left.type === "comment" && right.type === "comment") {
    return left.commentType === right.commentType && left.content === right.content &&
      left.author === right.author && left.createdAt === right.createdAt &&
      left.modifiedAt === right.modifiedAt && left.source === right.source;
  }

  if (left.type === "form_field" && right.type === "form_field") {
    return left.fieldName === right.fieldName && JSON.stringify(left.value) === JSON.stringify(right.value);
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
    externalRevision: current.externalRevision,
    coalescingKey: null,
  });
}

export function pdfEditsReducer(
  state: PdfEditsByDocument,
  action: PdfEditsAction,
): PdfEditsByDocument {
  switch (action.type) {
    case "hydrate": {
      const current = getDocumentEditingState(state, action.documentId);
      const known = new Set(current.edits.map((edit) => edit.id));
      const additions = action.edits.filter((edit) => !known.has(edit.id));
      if (additions.length === 0) return state;
      return { ...state, [action.documentId]: withDerivedState({ ...current, edits: [...current.edits, ...additions] }) };
    }
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

      if (action.coalesceKey && current.coalescingKey === action.coalesceKey) {
        return {
          ...state,
          [action.documentId]: withDerivedState({
            ...current,
            edits: current.edits.map((edit) =>
              edit.id === action.edit.id ? action.edit : edit,
            ),
          }),
        };
      }

      const committed = commitEdits(
        current,
        current.edits.map((edit) =>
          edit.id === action.edit.id ? action.edit : edit,
        ),
      );
      return {
        ...state,
        [action.documentId]: action.coalesceKey
          ? { ...committed, coalescingKey: action.coalesceKey }
          : committed,
      };
    }
    case "finish_coalescing": {
      const current = getDocumentEditingState(state, action.documentId);
      if (current.coalescingKey !== action.coalesceKey) {
        return state;
      }
      return {
        ...state,
        [action.documentId]: { ...current, coalescingKey: null },
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
    case "reorder": {
      const current = getDocumentEditingState(state, action.documentId);
      const selected = current.edits.find((edit) => edit.id === action.editId);
      if (!selected) return state;
      const objects = current.edits.filter((edit) => edit.page === selected.page &&
        isLayerObject(edit));
      const from = objects.findIndex((edit) => edit.id === selected.id);
      if (from < 0) return state;
      const to = action.direction === "front" ? objects.length - 1 : action.direction === "back" ? 0 :
        Math.max(0, Math.min(objects.length - 1, from + (action.direction === "forward" ? 1 : -1)));
      if (from === to) return state;
      objects.splice(from, 1);
      objects.splice(to, 0, selected);
      let index = 0;
      const ids = new Set(objects.map((edit) => edit.id));
      const edits = current.edits.map((edit) => ids.has(edit.id) ? objects[index++] : edit);
      return { ...state, [action.documentId]: commitEdits(current, edits) };
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
          externalRevision: current.externalRevision,
          coalescingKey: null,
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
          externalRevision: current.externalRevision,
          coalescingKey: null,
        }),
      };
    }
    case "mark_dirty": {
      const current = getDocumentEditingState(state, action.documentId);

      return {
        ...state,
        [action.documentId]: withDerivedState({
          ...current,
          externalDirty: true,
          externalRevision: current.externalRevision + 1,
        }),
      };
    }
    case "mark_saved": {
      const current = getDocumentEditingState(state, action.documentId);

      if (!current.isDirty || (action.edits && action.edits !== current.edits)) {
        return state;
      }

      return {
        ...state,
        [action.documentId]: withDerivedState({
          ...current,
          coalescingKey: null,
          savedRevision: action.revision ?? current.revision,
          externalDirty: (action.revision !== undefined && action.revision !== current.revision) || (action.externalRevision !== undefined && action.externalRevision !== current.externalRevision) ? current.externalDirty : false,
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

import {
  createInitialPagePlan,
  isValidPagePlanForDocument,
  type OrganizePagePlan,
} from "../organize/pagePlan";
import type {
  AddTextEdit,
  FreehandEdit,
  NativeTextEdit,
  PdfCommentEdit,
  PdfFormEdit,
  PdfFormLockEdit,
  PdfEdit,
  ShapeEdit,
  SignatureEdit,
  SignatureImage,
  TextMarkupEdit,
} from "../editing/types";
import {
  getDocumentEditingState,
  type PdfEditsByDocument,
} from "../editing/state";
import { getCustomFont } from "../fonts/fontRegistry";
import { getSuggestedPdfSaveName } from "./fileName";

export type PdfExportOperation = "export" | "save_as" | "print";

export type PdfExportSourceDocument = {
  id: string;
  fileName: string;
  workingSaveName: string | null;
  file: File;
  pageCount: number;
};

type PdfExportFont = {
  id: string;
  sha256: string;
  format: "ttf" | "otf";
  originalFileName: string;
  binary: Blob;
};

export type BuildPdfExportPayloadInput = {
  documentId: string;
  operation: PdfExportOperation;
  requestedOutputName?: string;
  activeDocumentId: string | null;
  outputName: string;
  saveToOutputDir: boolean;
  documents: readonly PdfExportSourceDocument[];
  organizationPlans: Readonly<Record<string, OrganizePagePlan>>;
  editsByDocument: PdfEditsByDocument;
  signatureImages: Readonly<Record<string, SignatureImage>>;
  resolveCustomFont?: (fontRef: string) => Promise<PdfExportFont | null>;
};

export type BuildPdfExportPayloadResult =
  | { ok: true; formData: FormData; outputName: string }
  | { ok: false; message: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Lecture de ressource impossible.")));
    reader.readAsDataURL(blob);
  });
}

/** Builds the sole multipart contract used by Save, Save As, export and print. */
export function buildPdfExportPayload(
  input: BuildPdfExportPayloadInput,
): BuildPdfExportPayloadResult | Promise<BuildPdfExportPayloadResult> {
  const sourceDocument = input.documents.find((document) => document.id === input.documentId);
  if (!sourceDocument) {
    return { ok: false, message: "Le document à sauvegarder n'est plus ouvert." };
  }
  const organizationPlan = input.organizationPlans[input.documentId]
    ?? createInitialPagePlan(sourceDocument.id, sourceDocument.fileName, sourceDocument.pageCount);
  if (organizationPlan.pages.length === 0) {
    return { ok: false, message: "Aucune page n'est disponible pour l'export." };
  }

  const requiredDocumentIds = [...new Set(organizationPlan.pages.map((page) => page.sourceDocumentId))];
  const sourceDocuments = requiredDocumentIds.map((documentId) =>
    input.documents.find((document) => document.id === documentId),
  );
  if (sourceDocuments.some((document) => !document)) {
    return {
      ok: false,
      message: "Un PDF source requis par le plan n'est plus disponible. Retirez ses pages ou réinitialisez le plan.",
    };
  }
  const availableDocuments = sourceDocuments as PdfExportSourceDocument[];
  const sourceDocumentInfo = Object.fromEntries(
    input.documents.map((document) => [document.id, { fileName: document.fileName, pageCount: document.pageCount }]),
  );
  if (!isValidPagePlanForDocument(organizationPlan, sourceDocument.id, sourceDocumentInfo)) {
    return {
      ok: false,
      message: "Le plan d'organisation est invalide. Réinitialisez-le avant d'exporter.",
    };
  }

  const outputName = input.operation === "save_as" && input.requestedOutputName
    ? input.requestedOutputName
    : input.operation === "export" && sourceDocument.id === input.activeDocumentId
      ? input.outputName.trim() || getSuggestedPdfSaveName(sourceDocument.fileName, sourceDocument.workingSaveName)
      : getSuggestedPdfSaveName(sourceDocument.fileName, sourceDocument.workingSaveName);
  const exportedPagesByDocument = new Map<string, Set<number>>();
  organizationPlan.pages.forEach((page) => {
    const exportedPages = exportedPagesByDocument.get(page.sourceDocumentId) ?? new Set<number>();
    exportedPages.add(page.sourcePageIndex + 1);
    exportedPagesByDocument.set(page.sourceDocumentId, exportedPages);
  });
  type ExportedEdit = PdfEdit & { sourceDocumentId: string; order: number };
  const exportedEdits: ExportedEdit[] = requiredDocumentIds.flatMap((documentId) =>
    getDocumentEditingState(input.editsByDocument, documentId).edits.flatMap((edit, order) => {
      const pageIsExported = exportedPagesByDocument.get(documentId)?.has(edit.page);
      const editIsExportable = edit.type === "add_text"
        ? edit.text.length > 0
        : edit.type === "signature"
          ? input.signatureImages[edit.imageId] !== undefined
          : true;
      return pageIsExported && editIsExportable ? [{ ...edit, sourceDocumentId: documentId, order }] : [];
    }),
  );
  const textEdits = exportedEdits.filter((edit): edit is AddTextEdit & ExportedEdit => edit.type === "add_text");
  const nativeTextEdits = exportedEdits.filter((edit): edit is NativeTextEdit & ExportedEdit => edit.type === "native_text");
  const signatureEdits = exportedEdits.filter((edit): edit is SignatureEdit & ExportedEdit => edit.type === "signature");
  const shapeEdits = exportedEdits.filter((edit): edit is ShapeEdit & ExportedEdit => edit.type === "shape");
  const freehandEdits = exportedEdits.filter((edit): edit is FreehandEdit & ExportedEdit => edit.type === "freehand");
  const textMarkupEdits = exportedEdits.filter((edit): edit is TextMarkupEdit & ExportedEdit => edit.type === "text_markup");
  const comments = exportedEdits.filter((edit): edit is PdfCommentEdit & ExportedEdit => edit.type === "comment" && edit.source === "local");
  const formValues = exportedEdits.filter((edit): edit is PdfFormEdit & ExportedEdit => edit.type === "form_field");
  const formLocks = requiredDocumentIds.flatMap((documentId) =>
    getDocumentEditingState(input.editsByDocument, documentId).edits.flatMap((edit, order) =>
      edit.type === "form_lock" ? [{ ...edit, sourceDocumentId: documentId, order }] : [],
    ),
  ) as Array<PdfFormLockEdit & { sourceDocumentId: string; order: number }>;
  const signatureImages = [...new Set(signatureEdits.map((edit) => edit.imageId))].flatMap((imageId) => {
    const image = input.signatureImages[imageId];
    return image ? [image] : [];
  });
  const customFontRefs = [...new Set(
    [...textEdits, ...nativeTextEdits]
      .map((edit) => edit.style.fontRef)
      .filter((fontRef): fontRef is string => Boolean(fontRef?.startsWith("custom:"))),
  )];
  const resolveCustomFont = input.resolveCustomFont ?? getCustomFont;
  type ExportedFontResource = {
    id: string;
    sha256: string;
    format: "ttf" | "otf";
    fileName: string;
    dataUrl: string;
  };
  const createPayload = (fontResources: ExportedFontResource[]): BuildPdfExportPayloadResult => {
    const formData = new FormData();
    availableDocuments.forEach((document) => formData.append("files", document.file, document.fileName));
    formData.append("documentIds", JSON.stringify(requiredDocumentIds));
    formData.append("plan", JSON.stringify({
      outputName,
      saveToOutputDir: input.operation === "export" ? input.saveToOutputDir : false,
      pages: organizationPlan.pages.map((page) => ({
        sourceDocumentId: page.sourceDocumentId,
        sourcePageIndex: page.sourcePageIndex,
        rotation: page.rotation,
      })),
      ...(textEdits.length > 0 ? { edits: textEdits } : {}),
      ...(nativeTextEdits.length > 0 ? { nativeTextEdits } : {}),
      ...(fontResources.length > 0 ? { fontResources } : {}),
      ...(signatureEdits.length > 0 ? { signatures: signatureEdits, signatureImages } : {}),
      ...(shapeEdits.length > 0 ? { shapes: shapeEdits } : {}),
      ...(freehandEdits.length > 0 ? { freehands: freehandEdits } : {}),
      ...(textMarkupEdits.length > 0 ? { textMarkups: textMarkupEdits } : {}),
      ...(comments.length > 0 ? { comments } : {}),
      ...(formValues.length > 0 ? {
        formValues: formValues.map((edit) => ({ sourceDocumentId: edit.sourceDocumentId, page: edit.page, fieldName: edit.fieldName, value: edit.value })),
      } : {}),
      ...(formLocks.length > 0 ? {
        formLocks: formLocks.map((edit) => ({ sourceDocumentId: edit.sourceDocumentId, locked: edit.locked })),
      } : {}),
    }));
    return { ok: true, formData, outputName };
  };

  if (customFontRefs.length === 0) {
    return createPayload([]);
  }

  return Promise.all(customFontRefs.map(async (fontRef) => {
    const font = await resolveCustomFont(fontRef);
    if (!font) throw new Error(`La police personnalisée ${fontRef} n'est plus disponible. Remplacez-la avant l'export.`);
    return {
      id: font.id,
      sha256: font.sha256,
      format: font.format,
      fileName: font.originalFileName,
      dataUrl: await blobToDataUrl(font.binary),
    };
  })).then(createPayload).catch((error): BuildPdfExportPayloadResult => ({
    ok: false,
    message: error instanceof Error ? error.message : "Une police personnalisée est indisponible.",
  }));
}

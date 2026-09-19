import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import {
  type StoredPdfDocument,
  type ViewerDocumentSnapshot,
} from "../storage/viewerStorage";
import type { NativeTextEdit, PdfFormStateEdit } from "../editing/types";
import { clearNativeTextCache } from "./nativeText";

const DEFAULT_RECOMMENDED_MAX_FILE_SIZE_MB = 50;
const DEFAULT_RECOMMENDED_MAX_PAGE_COUNT = 250;
const DEFAULT_RECOMMENDED_MAX_OPEN_DOCUMENTS = 8;

export type OpenPdfDocument = {
  id: string;
  fileName: string;
  workingSaveName: string | null;
  file: File;
  pdfDocument: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
  pageCount: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  error: string | null;
};

function getRecommendedLimit(value: string | undefined, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

const RECOMMENDED_MAX_FILE_SIZE_MB = getRecommendedLimit(
  import.meta.env.VITE_PDF_RECOMMENDED_MAX_SIZE_MB,
  DEFAULT_RECOMMENDED_MAX_FILE_SIZE_MB,
);
const RECOMMENDED_MAX_FILE_SIZE_BYTES = RECOMMENDED_MAX_FILE_SIZE_MB * 1024 * 1024;
const RECOMMENDED_MAX_PAGE_COUNT = getRecommendedLimit(
  import.meta.env.VITE_PDF_RECOMMENDED_MAX_PAGE_COUNT,
  DEFAULT_RECOMMENDED_MAX_PAGE_COUNT,
);
const RECOMMENDED_MAX_OPEN_DOCUMENTS = getRecommendedLimit(
  import.meta.env.VITE_PDF_RECOMMENDED_MAX_OPEN_DOCUMENTS,
  DEFAULT_RECOMMENDED_MAX_OPEN_DOCUMENTS,
);

export function getDocumentUsageWarnings(file: File, pageCount: number, openDocumentCount: number) {
  const warnings: string[] = [];

  if (file.size > RECOMMENDED_MAX_FILE_SIZE_BYTES) {
    warnings.push(
      `${file.name} dépasse la taille recommandée de ${RECOMMENDED_MAX_FILE_SIZE_MB} Mo.`,
    );
  }

  if (pageCount > RECOMMENDED_MAX_PAGE_COUNT) {
    warnings.push(
      `${file.name} contient ${pageCount} pages, au-delà des ${RECOMMENDED_MAX_PAGE_COUNT} recommandées.`,
    );
  }

  if (openDocumentCount > RECOMMENDED_MAX_OPEN_DOCUMENTS) {
    warnings.push(
      `${openDocumentCount} documents sont ouverts, au-delà des ${RECOMMENDED_MAX_OPEN_DOCUMENTS} recommandés.`,
    );
  }

  return warnings;
}

export function getUniqueFileName(fileName: string, existingFileNames: string[]) {
  if (!existingFileNames.includes(fileName)) {
    return fileName;
  }

  const extensionMatch = /\.pdf$/i.exec(fileName);
  const extension = extensionMatch ? extensionMatch[0] : ".pdf";
  const baseName = fileName.slice(0, -extension.length) || "document";
  let suffix = 2;
  let candidate = `${baseName}-${suffix}${extension}`;

  while (existingFileNames.includes(candidate)) {
    suffix += 1;
    candidate = `${baseName}-${suffix}${extension}`;
  }

  return candidate;
}

export function releasePdfDocument(document: OpenPdfDocument) {
  // Native-text previews are keyed by the File. Clear their page-scoped cache
  // before the document object becomes unreachable.
  clearNativeTextCache(document.file);
  window.setTimeout(() => {
    // Page canvases and render tasks are unmounted before this deferred work.
    // cleanup releases PDF.js page/font resources without retaining loaded
    // fonts; destroying the loading task then tears down the worker transport.
    const cleanup = document.pdfDocument.cleanup;
    void Promise.resolve(
      typeof cleanup === "function" ? cleanup.call(document.pdfDocument) : undefined,
    )
      .catch(() => undefined)
      .finally(() => document.loadingTask.destroy().catch(() => undefined));
  }, 0);
}

export function buildViewerSnapshot(document: OpenPdfDocument, nativeTextEdits: NativeTextEdit[] = [], formEdits: PdfFormStateEdit[] = []): ViewerDocumentSnapshot {
  return {
    id: document.id,
    fileName: document.fileName,
    workingSaveName: document.workingSaveName,
    mimeType: document.file.type,
    content: document.file,
    pageCount: document.pageCount,
    zoom: document.zoom,
    scrollLeft: document.scrollLeft,
    scrollTop: document.scrollTop,
    ...(nativeTextEdits.length ? { nativeTextEdits } : {}),
    ...(formEdits.length ? { formEdits } : {}),
  };
}

export async function restoreOpenDocument(storedDocument: StoredPdfDocument): Promise<OpenPdfDocument> {
  if (!(storedDocument.content instanceof Blob) || storedDocument.content.size === 0) {
    throw new Error("Le document restauré ne contient plus de données PDF valides.");
  }
  // Materialize the IndexedDB-backed Blob into memory once. Firefox can
  // otherwise abort a later second read of the restored Blob.
  const storedBytes = new Uint8Array(await storedDocument.content.arrayBuffer());
  const file = new File([storedBytes], storedDocument.fileName, {
    type: storedDocument.mimeType || "application/pdf",
  });
  const data = storedBytes.slice();
  const loadingTask = pdfjsLib.getDocument({ data });

  try {
    const pdfDocument = await loadingTask.promise;

    return {
      id: storedDocument.id,
      fileName: storedDocument.fileName,
      workingSaveName: storedDocument.workingSaveName ?? null,
      file,
      pdfDocument,
      loadingTask,
      pageCount: pdfDocument.numPages,
      zoom: storedDocument.zoom,
      scrollLeft: storedDocument.scrollLeft,
      scrollTop: storedDocument.scrollTop,
      error: null,
    };
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw error;
  }
}

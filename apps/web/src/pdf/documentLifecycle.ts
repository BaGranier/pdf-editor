import { createImagePdf, readImageSource, DEFAULT_IMAGE_LAYOUT, type SourceMedia } from "../images/imageDocument";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import {
  type StoredPdfDocument,
  type ViewerDocumentSnapshot,
} from "../storage/viewerStorage";
import type { NativeTextEdit, PdfFormStateEdit } from "../editing/types";
import type { DocumentSource } from "../desktop/files";
import { clearNativeTextCache } from "./nativeText";

const DEFAULT_RECOMMENDED_MAX_FILE_SIZE_MB = 50;
const DEFAULT_RECOMMENDED_MAX_PAGE_COUNT = 250;
const DEFAULT_RECOMMENDED_MAX_OPEN_DOCUMENTS = 8;

export type OpenPdfDocument = {
  id: string;
  fileName: string;
  workingSaveName: string | null;
  source: DocumentSource;
  /** Set only after a successful Save As; never persisted. */
  saveDestination?: { documentId: string; fileName: string };
  media?: SourceMedia;
  imageBackgroundKey?: string;
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

  const extensionMatch = /\.[^.]+$/.exec(fileName);
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
    media: document.media?.kind === "image" ? { kind: "image", mimeType: document.media.mimeType, widthPx: document.media.widthPx, heightPx: document.media.heightPx } : document.media,
    mimeType: document.file.type,
    content: document.media?.kind === "image" ? document.media.original : document.file,
    pageCount: document.pageCount,
    zoom: document.zoom,
    scrollLeft: document.scrollLeft,
    scrollTop: document.scrollTop,
    ...(nativeTextEdits.length ? { nativeTextEdits } : {}),
    ...(formEdits.length ? { formEdits } : {}),
  };
}

export async function restoreOpenDocument(storedDocument: StoredPdfDocument, backendUrl = "http://localhost:8000"): Promise<OpenPdfDocument> {
  if (!(storedDocument.content instanceof Blob) || storedDocument.content.size === 0) {
    throw new Error("RESTORE_BLOB_ABSENT");
  }
  // Materialize the IndexedDB-backed Blob into memory once. Firefox can
  // otherwise abort a later second read of the restored Blob.
  let storedBytes: Uint8Array<ArrayBuffer>;
  try {
    storedBytes = new Uint8Array(await storedDocument.content.arrayBuffer());
  } catch {
    throw new Error("RESTORE_BLOB_UNREADABLE");
  }
  let restoredMedia: SourceMedia = { kind: "pdf" };
  if (storedDocument.media?.kind === "image") {
    restoredMedia = await readImageSource(new Blob([storedBytes]));
    const transforms = storedDocument.edits?.find((edit) => edit.type === "image_background")?.transforms ?? [];
    const pdf = await createImagePdf(backendUrl, [restoredMedia], { ...DEFAULT_IMAGE_LAYOUT, transforms });
    storedBytes = new Uint8Array(await pdf.arrayBuffer());
  }
  const file = new File([storedBytes], storedDocument.fileName, {
    type: storedDocument.mimeType || "application/pdf",
  });
  const data = storedBytes.slice();
  const loadingTask = pdfjsLib.getDocument({ data });

  try {
    const pdfDocument = await loadingTask.promise;

    return {
      media: restoredMedia,
      imageBackgroundKey: JSON.stringify(storedDocument.edits?.find((edit) => edit.type === "image_background")?.transforms ?? []),
      id: storedDocument.id,
      fileName: storedDocument.fileName,
      workingSaveName: storedDocument.workingSaveName ?? null,
      source: { type: "web" },
      file,
      pdfDocument,
      loadingTask,
      pageCount: pdfDocument.numPages,
      zoom: Number.isFinite(storedDocument.zoom) && storedDocument.zoom > 0 ? storedDocument.zoom : 1,
      scrollLeft: Number.isFinite(storedDocument.scrollLeft) && storedDocument.scrollLeft >= 0 ? storedDocument.scrollLeft : 0,
      scrollTop: Number.isFinite(storedDocument.scrollTop) && storedDocument.scrollTop >= 0 ? storedDocument.scrollTop : 0,
      error: null,
    };
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw new Error("RESTORE_PDFJS_FAILED");
  }
}

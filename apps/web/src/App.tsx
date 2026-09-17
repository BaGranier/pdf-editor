import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import * as pdfjsLib from "pdfjs-dist";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PageViewport,
  RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
  clearStoredDocuments,
  clearViewerStorage,
  loadOrganizationPlan,
  loadStoredDocuments,
  loadViewerPreferences,
  removeOrganizationPlan,
  removeStoredDocument,
  saveOrganizationPlan,
  saveStoredDocument,
  saveViewerPreferences,
  type StoredPdfDocument,
  type ThemeMode,
  type ViewerDocumentSnapshot,
  type ViewerPreferences,
  type ViewerMode as PersistedViewerMode,
} from "./storage/viewerStorage";
import {
  createInitialPagePlan,
  hydratePlanSourceNames,
  isPlanModified,
  isValidPagePlanForDocument,
  moveOrganizedPageByIndex,
  renumberOrganizedPages,
  rotatePage,
  type OrganizePagePlan,
  type OrganizedPage,
} from "./organize/pagePlan";
import { OcrDialog } from "./components/OcrDialog";
import { ConversionDialog } from "./components/ConversionDialog";
import {
  downloadConversionFile,
  requestConversion,
  type ConversionOptions,
} from "./conversion/conversion";
import {
  getDownloadFileName,
  requestOcrPdf,
  type OcrOptions,
} from "./ocr/ocr";
import {
  renderPdfTextLayer,
  type PdfTextLayerRenderTask,
} from "./pdf/textLayer";
import { getWebBackendBaseUrl } from "./api/backend";
import { PdfEditLayer } from "./components/PdfEditLayer";
import { TextEditToolbar } from "./components/TextEditToolbar";
import { NativeTextLayer } from "./components/NativeTextLayer";
import { ShapeEditToolbar } from "./components/ShapeEditToolbar";
import { FreehandEditToolbar } from "./components/FreehandEditToolbar";
import { AppLogo } from "./components/AppLogo";
import { AppStateScreen } from "./components/AppStateScreen";
import { ColorPicker } from "./components/ColorPicker";
import { SaveAsDialog } from "./components/SaveAsDialog";
import {
  SignatureDialog,
  type SignatureImageDraft,
} from "./components/SignatureDialog";
import {
  DEFAULT_SHAPE_STYLE,
  DEFAULT_FREEHAND_STYLE,
  DEFAULT_TEXT_STYLE,
  type AddTextEdit,
  type EditingTool,
  type FreehandEdit,
  type FreehandStyle,
  type PdfEdit,
  type PdfCommentEdit,
  type PdfRect,
  type SignatureEdit,
  type SignatureImage,
  type ShapeEdit,
  type ShapeType,
  type TextMarkupEdit,
  type TextMarkupKind,
  type NativeTextEdit,
} from "./editing/types";
import { clearNativeTextCache, loadNativeTextPage, renderNativeTextBackground, validateNativeTextFont, type NativeTextFontValidation, type NativeTextSpan } from "./pdf/nativeText";
import { normalizeSubsetFontName } from "./fonts/catalog";
import { fontRegistry, getCustomFont } from "./fonts/fontRegistry";
import { selectionClientRectsToPdfRects } from "./pdf/selectionGeometry";
import { findTextMarkupAtPoint } from "./pdf/textMarkupHitTest";
import { loadPdfComments } from "./pdf/comments";
import { getCommentTypeLabel } from "./editing/comments";
import { offsetPdfRectWithinPage } from "./editing/coordinates";
import { getAnnotationScrollTop } from "./pdf/annotationNavigation";
import {
  getDocumentEditingState,
  pdfEditsReducer,
} from "./editing/state";
import { downloadPdfToBrowser } from "./saving/destination";
import { getSuggestedPdfSaveName } from "./saving/fileName";
import { computeFitScale } from "./viewer/fit";
import { getCanvasRenderDimensions } from "./viewer/rendering";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const VIEWER_PAN_STEP = 56;
const DEFAULT_RECOMMENDED_MAX_FILE_SIZE_MB = 50;
const DEFAULT_RECOMMENDED_MAX_PAGE_COUNT = 250;
const DEFAULT_RECOMMENDED_MAX_OPEN_DOCUMENTS = 8;

type RenderState = "idle" | "loading" | "ready" | "error";
type WorkspaceMode = "read" | "organize";
type ViewerMode = PersistedViewerMode | "presentation";
type ExportFeedback = {
  kind: "success" | "warning" | "error";
  message: string;
};

type PdfExportWarning = {
  type: "text_overflow";
  editId: string;
  page: number;
  rendering: "expanded" | "partial";
};

function parsePdfExportWarnings(value: string | null): PdfExportWarning[] {
  if (!value) {
    return [];
  }
  try {
    const warnings: unknown = JSON.parse(value);
    return Array.isArray(warnings)
      ? warnings.filter(
          (warning): warning is PdfExportWarning =>
            typeof warning === "object" &&
            warning !== null &&
            (warning as Partial<PdfExportWarning>).type === "text_overflow" &&
            typeof (warning as Partial<PdfExportWarning>).editId === "string" &&
            typeof (warning as Partial<PdfExportWarning>).page === "number" &&
            ["expanded", "partial"].includes(
              String((warning as Partial<PdfExportWarning>).rendering),
            ),
        )
      : [];
  } catch {
    return [];
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Lecture de ressource impossible.")));
    reader.readAsDataURL(blob);
  });
}

type OpenPdfDocument = {
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

type DocumentSidebarProps = {
  documents: OpenPdfDocument[];
  openFileInputRef: RefObject<HTMLInputElement | null>;
  activePageNumber: number;
  pagePlan: OrganizePagePlan | null;
  onSelectPage: (pageNumber: number) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  status: string;
  storageWarning: string | null;
  sidebarId: string;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  pageView: "list" | "grid";
  onPageViewChange: (view: "list" | "grid") => void;
  comments: PdfCommentEdit[];
  commentsView: boolean;
  selectedCommentId: string | null;
  onCommentsViewChange: (value: boolean) => void;
  onSelectComment: (comment: PdfCommentEdit) => void;
};

function CommentInspector({ edit, onUpdate, onDelete }: { edit: PdfCommentEdit; onUpdate: (edit: PdfCommentEdit) => void; onDelete: () => void }) {
  const [author, setAuthor] = useState(edit.author ?? "");
  const [content, setContent] = useState(edit.content);
  useEffect(() => { setAuthor(edit.author ?? ""); setContent(edit.content); }, [edit]);
  const editable = edit.source === "local";
  const commit = () => {
    const nextAuthor = author.trim() || undefined;
    const nextContent = content.trim();
    if (!editable || !nextContent || (nextAuthor === edit.author && nextContent === edit.content)) return;
    onUpdate({ ...edit, author: nextAuthor, content: nextContent, modifiedAt: new Date().toISOString() });
  };
  return <section className="shape-edit-toolbar comment-inspector" aria-label="Propriétés du commentaire">
    <strong>Commentaire</strong>
    <label>Rédacteur<input aria-label="Rédacteur" value={author} readOnly={!editable} onChange={(event) => setAuthor(event.target.value)} onBlur={commit} placeholder="Non renseigné" /></label>
    <label>Message<textarea aria-label="Message" value={content} readOnly={!editable} onChange={(event) => setContent(event.target.value)} onBlur={commit} rows={4} /></label>
    <label>Type de message<output aria-label="Type de message">{getCommentTypeLabel(edit.commentType)}</output></label>
    <label>Source<output aria-label="Source">{edit.source === "pdf" ? "PDF source" : "Créé dans PDF Studio Local"}</output></label>
    {editable ? <button type="button" onClick={onDelete}>Supprimer le commentaire</button> : null}
  </section>;
}

type SidebarKeyTarget = "file-input" | string | null;
type ViewerFocusTarget = "viewer" | null;
type FocusTarget = SidebarKeyTarget | ViewerFocusTarget;

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

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

function getDocumentUsageWarnings(file: File, pageCount: number, openDocumentCount: number) {
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

function getUniqueFileName(fileName: string, existingFileNames: string[]) {
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

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  canvas.removeAttribute("style");
}

function releasePdfDocument(document: OpenPdfDocument) {
  window.setTimeout(() => {
    void document.loadingTask.destroy().catch(() => undefined);
  }, 0);
}

function getSystemTheme(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }

  return "light";
}

function getInitialTheme(preferences: ViewerPreferences | null): ThemeMode {
  return preferences?.theme ?? getSystemTheme();
}

function buildViewerSnapshot(document: OpenPdfDocument, nativeTextEdits: NativeTextEdit[] = []): ViewerDocumentSnapshot {
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
  };
}

async function restoreOpenDocument(storedDocument: StoredPdfDocument): Promise<OpenPdfDocument> {
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

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
  }

  return target.type === "file" || target.type === "text" || target.type === "search" || target.type === "email" || target.type === "url" || target.type === "tel" || target.type === "password" || target.type === "number";
}

function clonePdfEdit(edit: PdfEdit): PdfEdit {
  if (edit.type === "add_text") {
    return {
      ...edit,
      rect: { ...edit.rect },
      style: { ...edit.style },
    };
  }

  if (edit.type === "shape") {
    return {
      ...edit,
      rect: { ...edit.rect },
      style: { ...edit.style },
    };
  }

  if (edit.type === "freehand") {
    return { ...edit, rect: { ...edit.rect }, points: edit.points.map((point) => ({ ...point })), style: { ...edit.style } };
  }

  if (edit.type === "text_markup") {
    return { ...edit, rect: { ...edit.rect }, rects: edit.rects.map((rect) => ({ ...rect })) };
  }

  if (edit.type === "comment") {
    return { ...edit, rect: { ...edit.rect } };
  }

  return { ...edit, rect: { ...edit.rect } };
}

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.closest(
      "button, input, textarea, select, a[href], [contenteditable='true'], .textLayer, .pdf-edit-layer",
    ) !== null
  );
}

function getSidebarDocumentId(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const documentButton = target.closest<HTMLElement>("[data-document-id]");

  return documentButton?.dataset.documentId ?? null;
}

function scrollViewerToPosition(viewer: HTMLElement, left: number, top: number) {
  if (typeof viewer.scrollTo === "function") {
    viewer.scrollTo({ left, top, behavior: "smooth" });
    return;
  }

  viewer.scrollLeft = left;
  viewer.scrollTop = top;
}

function scrollViewerByDelta(viewer: HTMLElement, left: number, top: number) {
  if (typeof viewer.scrollBy === "function") {
    viewer.scrollBy({ left, top, behavior: "smooth" });
    return;
  }

  viewer.scrollLeft += left;
  viewer.scrollTop += top;
}

type PdfPageCanvasProps = {
  backendUrl: string;
  sourceFile: File;
  pdfDocument: PDFDocumentProxy;
  sourcePageNumber: number;
  displayPageNumber: number;
  rotation: number;
  zoom: number;
  edits: PdfEdit[];
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  nativeTextRuntimeActive: boolean;
  freehandStyle: FreehandStyle;
  pendingSignatureImage: SignatureImage | null;
  eyedropperTarget: "stroke" | "fill" | null;
  scrollRootRef: RefObject<HTMLElement | null>;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onAddNativeText: (span: NativeTextSpan, text: string) => void;
  onAddShape: (pageNumber: number, shapeType: ShapeType, rect: PdfRect) => void;
  onAddFreehand: (pageNumber: number, points: import("./editing/types").PdfPoint[]) => void;
  onStartComment: (pageNumber: number, point: import("./editing/types").PdfPoint) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit) => void;
  onDeleteEdit: (editId: string) => void;
  onSampleColor: (color: string) => void;
  fontLibraryRevision: number;
};

function PdfPageCanvas({
  backendUrl,
  sourceFile,
  pdfDocument,
  sourcePageNumber,
  displayPageNumber,
  rotation,
  zoom,
  edits,
  signatureImages,
  selectedEditId,
  activeTool,
  nativeTextRuntimeActive,
  freehandStyle,
  pendingSignatureImage,
  eyedropperTarget,
  scrollRootRef,
  registerPageRef,
  onAddText,
  onAddNativeText,
  onAddShape,
  onAddFreehand,
  onStartComment,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onDeleteEdit,
  onSampleColor,
  fontLibraryRevision,
}: PdfPageCanvasProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [nativeTextSpans, setNativeTextSpans] = useState<NativeTextSpan[]>([]);
  const [nativeTextError, setNativeTextError] = useState<string | null>(null);
  const [nativeTextIndexed, setNativeTextIndexed] = useState(false);
  const [nativeTextPreviewDraft, setNativeTextPreviewDraft] = useState<NativeTextEdit | null>(null);
  const [nativeTextPreviewUrl, setNativeTextPreviewUrl] = useState<string | null>(null);
  const [nativeTextBackgroundReady, setNativeTextBackgroundReady] = useState(false);
  const [nativeTextFontValidation, setNativeTextFontValidation] = useState<Record<string, NativeTextFontValidation>>({});
  const nativeTextMaskEdits = (() => {
    const committed = edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text");
    return nativeTextPreviewDraft
      ? [...committed.filter((edit) => edit.source.sourceFingerprint !== nativeTextPreviewDraft.source.sourceFingerprint), nativeTextPreviewDraft]
      : committed;
  })();
  const nativeTextMaskKey = nativeTextMaskEdits.map((edit) => edit.source.sourceFingerprint).sort().join(":");

  useEffect(() => () => {
    if (nativeTextPreviewUrl) URL.revokeObjectURL(nativeTextPreviewUrl);
  }, [nativeTextPreviewUrl]);

  useEffect(() => {
    if (!nativeTextRuntimeActive) {
      setNativeTextPreviewUrl(null);
      setNativeTextBackgroundReady(false);
      return;
    }
    if (nativeTextMaskEdits.length === 0) {
      setNativeTextPreviewUrl(null);
      setNativeTextBackgroundReady(false);
      return;
    }
    let cancelled = false;
    setNativeTextBackgroundReady(false);
    void renderNativeTextBackground(backendUrl, sourceFile, sourcePageNumber, nativeTextMaskEdits, rotation).then((blob) => {
      if (cancelled) return;
      const next = URL.createObjectURL(blob);
      setNativeTextPreviewUrl(next);
      setNativeTextBackgroundReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setNativeTextError(error instanceof Error ? error.message : "Aperçu du texte impossible.");
    });
    return () => { cancelled = true; };
  }, [backendUrl, nativeTextMaskKey, nativeTextRuntimeActive, rotation, sourceFile, sourcePageNumber]);

  const prepareNativeTextBackground = useCallback(async (span: NativeTextSpan) => {
    try {
      await renderNativeTextBackground(backendUrl, sourceFile, sourcePageNumber, [{
        id: `native-preview-${span.sourceFingerprint}`,
        type: "native_text",
        page: span.page,
        rect: span.rect,
        source: span,
        text: "",
        style: {
          fontFamily: span.sourceFontName ?? "Noto Sans",
          fontSize: span.sourceFontSize,
          color: span.sourceColor,
          bold: span.fontWeight >= 700,
          fontStyle: span.fontStyle,
        },
      }], rotation);
      return true;
    } catch (error) {
      setNativeTextError(error instanceof Error ? error.message : "Aperçu du texte impossible.");
      return false;
    }
  }, [backendUrl, rotation, sourceFile, sourcePageNumber]);

  useEffect(() => {
    if (!nativeTextRuntimeActive) {
      setNativeTextFontValidation({});
      return;
    }
    const nativeEdits = edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text");
    let cancelled = false;
    if (nativeEdits.length === 0) {
      setNativeTextFontValidation({});
      return;
    }
    void Promise.all(nativeEdits.map(async (edit) => {
      const fontRef = edit.style.fontRef ?? edit.style.fontFamily;
      const customFont = fontRef.startsWith("custom:") ? await getCustomFont(fontRef) : null;
      if (fontRef.startsWith("custom:") && !customFont) {
        return [edit.id, { status: "missing", fontRef, message: `Police manquante : « ${edit.style.fontFamily} ». Importez le fichier .ttf ou .otf correspondant pour l’utiliser dans le PDF.` } satisfies NativeTextFontValidation] as const;
      }
      const resources = customFont ? [{ id: customFont.id, sha256: customFont.sha256, format: customFont.format, fileName: customFont.originalFileName, dataUrl: await blobToDataUrl(customFont.binary) }] : [];
      return [edit.id, await validateNativeTextFont(backendUrl, sourceFile, sourcePageNumber, edit, resources)] as const;
    })).then((entries) => {
      if (!cancelled) setNativeTextFontValidation(Object.fromEntries(entries));
    }).catch((error: unknown) => {
      if (!cancelled) setNativeTextError(error instanceof Error ? error.message : "Validation de police impossible.");
    });
    return () => { cancelled = true; };
  }, [backendUrl, edits, fontLibraryRevision, nativeTextRuntimeActive, sourceFile, sourcePageNumber]);

  useEffect(() => {
    if (!nativeTextRuntimeActive || !shouldRender) {
      setNativeTextSpans([]);
      setNativeTextIndexed(false);
      setNativeTextPreviewDraft(null);
      clearNativeTextCache(sourceFile);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setNativeTextIndexed(false);
    setNativeTextSpans([]);
    setNativeTextError(null);
    void loadNativeTextPage(backendUrl, sourceFile, sourcePageNumber, controller.signal)
      .then((spans) => {
        if (!cancelled) {
          setNativeTextSpans(spans);
          setNativeTextIndexed(true);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setNativeTextError(error instanceof Error ? error.message : "Analyse du texte impossible.");
          setNativeTextIndexed(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearNativeTextCache(sourceFile);
      setNativeTextSpans([]);
      setNativeTextIndexed(false);
      setNativeTextPreviewDraft(null);
    };
  }, [backendUrl, nativeTextRuntimeActive, shouldRender, sourceFile, sourcePageNumber]);

  const sampleRenderedColor = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!eyedropperTarget) {
        return false;
      }
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return true;
      }
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return true;
      }
      const pixelX = Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor((event.clientX - bounds.left) * (canvas.width / bounds.width)),
        ),
      );
      const pixelY = Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor((event.clientY - bounds.top) * (canvas.height / bounds.height)),
        ),
      );
      try {
        const [red, green, blue] = context.getImageData(pixelX, pixelY, 1, 1).data;
        onSampleColor(
          `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
        );
      } catch {
        // A canvas that cannot be sampled simply leaves the color unchanged.
      }
      return true;
    },
    [eyedropperTarget, onSampleColor],
  );

  useEffect(() => {
    const pageElement = pageRef.current;

    if (!pageElement) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      {
        root: scrollRootRef.current,
        rootMargin: "1200px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(pageElement);

    return () => {
      observer.disconnect();
    };
  }, [scrollRootRef]);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayerTask: PdfTextLayerRenderTask | null = null;
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    const textLayerContainer = textLayerRef.current;

    if (!shouldRender || !canvas || !surface || !textLayerContainer) {
      return;
    }

    async function renderPage() {
      setRenderState("loading");

      try {
        const page = await pdfDocument.getPage(sourcePageNumber);

        if (
          isCancelled ||
          !canvas ||
          !surface ||
          !textLayerContainer
        ) {
          return;
        }

        const viewport = page.getViewport({
          scale: zoom,
          rotation: ((page.rotate ?? 0) + rotation) % 360,
        });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const renderDimensions = getCanvasRenderDimensions(
          viewport.width,
          viewport.height,
          window.devicePixelRatio,
        );
        canvas.width = renderDimensions.canvasWidth;
        canvas.height = renderDimensions.canvasHeight;
        canvas.style.width = `${renderDimensions.cssWidth}px`;
        canvas.style.height = `${renderDimensions.cssHeight}px`;
        surface.style.width = `${renderDimensions.cssWidth}px`;
        surface.style.height = `${renderDimensions.cssHeight}px`;
        surface.style.minWidth = "0";
        surface.style.minHeight = "0";
        setViewport(viewport);

        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        try {
          textLayerTask = renderPdfTextLayer({
            page,
            viewport,
            container: textLayerContainer,
          });
          void textLayerTask.promise.catch((error: unknown) => {
            if (!isCancelled) {
              console.warn("Impossible de rendre la couche texte PDF.", error);
            }
          });
        } catch (error) {
          textLayerContainer.replaceChildren();
          textLayerContainer.hidden = true;
          console.warn("Impossible de démarrer la couche texte PDF.", error);
        }

        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: [renderDimensions.outputScale, 0, 0, renderDimensions.outputScale, 0, 0],
        });

        await renderTask.promise;

        if (!isCancelled) {
          setRenderState("ready");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setRenderState("error");
        }
      }
    }

    void renderPage();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      textLayerTask?.cancel();
      textLayerContainer.replaceChildren();
      textLayerContainer.hidden = true;
    };
  }, [pdfDocument, rotation, shouldRender, sourcePageNumber, zoom]);

  useEffect(() => {
    return () => {
      clearCanvas(canvasRef.current);
    };
  }, []);

  return (
    <article
      ref={(node) => {
        pageRef.current = node;
        registerPageRef(displayPageNumber, node);
      }}
      className="pdf-page"
      data-page-number={displayPageNumber}
      data-source-page-number={sourcePageNumber}
      data-rotation={rotation}
      aria-label={`Page ${displayPageNumber}`}
    >
      <div className="page-number">Page {displayPageNumber}</div>
      <div
        ref={surfaceRef}
        className="page-surface"
        onClick={(event) => {
          if (sampleRenderedColor(event)) {
            return;
          }
          if (activeTool === "select") {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
              return;
            }
            if (viewport && surfaceRef.current) {
              const bounds = surfaceRef.current.getBoundingClientRect();
              const [x, y] = viewport.convertToPdfPoint(
                event.clientX - bounds.left,
                event.clientY - bounds.top,
              );
              const markup = findTextMarkupAtPoint(
                edits.filter((edit): edit is TextMarkupEdit => edit.type === "text_markup"),
                sourcePageNumber,
                { x, y },
              );
              if (markup) {
                onSelectEdit(markup.id);
                return;
              }
            }
            onDeselectEdit();
          }
        }}
      >
        {renderState === "error" ? (
          <p className="page-error">Impossible d'afficher cette page.</p>
        ) : null}
        {renderState !== "ready" && renderState !== "error" ? (
          <div className="page-placeholder" aria-hidden="true">
            {renderState === "loading" ? "Chargement..." : ""}
          </div>
        ) : null}
        <canvas ref={canvasRef} className="pdf-canvas" />
        {nativeTextPreviewUrl ? <img className="native-text-preview" data-native-preview-kind="clean-background" src={nativeTextPreviewUrl} alt="" aria-hidden="true" /> : null}
        <div
          ref={textLayerRef}
          className="textLayer pdf-text-layer"
          hidden
          onMouseUp={() => {
            if (activeTool !== "select" || !viewport || !surfaceRef.current || !textLayerRef.current) return;
            window.setTimeout(() => {
              const selection = window.getSelection();
              if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
              const range = selection.getRangeAt(0);
              try {
                if (!range.intersectsNode(textLayerRef.current!)) return;
              } catch {
                return;
              }
              const surfaceBounds = surfaceRef.current!.getBoundingClientRect();
              const pageRects = [...range.getClientRects()].filter((rect) => {
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                return centerX >= surfaceBounds.left && centerX <= surfaceBounds.right && centerY >= surfaceBounds.top && centerY <= surfaceBounds.bottom;
              });
              const rects = selectionClientRectsToPdfRects(pageRects, surfaceBounds, viewport);
              const anchor = range.getBoundingClientRect();
              if (rects.length === 0 || anchor.width < 1) return;
              window.dispatchEvent(new CustomEvent("pdf-text-markup-selection", { detail: { page: sourcePageNumber, rects, top: anchor.top, left: anchor.left + anchor.width / 2 } }));
            }, 0);
          }}
        />
        {viewport && nativeTextRuntimeActive ? (
          <NativeTextLayer
            spans={nativeTextSpans.length ? nativeTextSpans : edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text").map((edit) => ({ ...edit.source, page: edit.page, rect: edit.rect, fontWeight: edit.style.bold ? 700 : 400, fontStyle: edit.style.fontStyle ?? "normal" }))}
            edits={edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text")}
            viewport={viewport}
            selectedEditId={selectedEditId}
            onCreateEdit={onAddNativeText}
            onSelectEdit={onSelectEdit}
            onUpdateEdit={(edit) => onUpdateEdit(edit)}
            onPreviewChange={setNativeTextPreviewDraft}
            onPrepareBackground={prepareNativeTextBackground}
            isBackgroundReady={nativeTextBackgroundReady}
            fontValidationByEditId={nativeTextFontValidation}
          />
        ) : null}
        {nativeTextError && nativeTextRuntimeActive ? <p className="native-text-layer__error" role="status">{nativeTextError}</p> : null}
        {nativeTextRuntimeActive && !nativeTextIndexed && !nativeTextError ? <p className="native-text-layer__error" role="status">Analyse du texte de cette page…</p> : null}
        {nativeTextRuntimeActive &&
        nativeTextIndexed &&
        !nativeTextError &&
        nativeTextSpans.length === 0 &&
        !edits.some((edit) => edit.type === "native_text") ? (
          <p className="native-text-layer__error" role="status">
            Aucun texte PDF natif modifiable sur cette page. Le texte présent uniquement dans une image ou converti en courbes ne peut pas être édité directement.
          </p>
        ) : null}
        {viewport ? (
          <PdfEditLayer
            pageNumber={sourcePageNumber}
            viewport={viewport}
            edits={edits}
            images={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeTool}
            freehandStyle={freehandStyle}
            pendingSignatureImage={pendingSignatureImage}
            onAddText={(rect) => onAddText(sourcePageNumber, rect)}
            onAddShape={(shapeType, rect) =>
              onAddShape(sourcePageNumber, shapeType, rect)
            }
            onAddFreehand={(points) => onAddFreehand(sourcePageNumber, points)}
            onStartComment={(point) => onStartComment(sourcePageNumber, point)}
            onPlaceSignature={(rect) => onPlaceSignature(sourcePageNumber, rect)}
            onSelect={onSelectEdit}
            onUpdate={onUpdateEdit}
            onDelete={onDeleteEdit}
          />
        ) : null}
      </div>
    </article>
  );
}

type PdfViewerProps = {
  backendUrl: string;
  document: OpenPdfDocument;
  documents: OpenPdfDocument[];
  pagePlan: OrganizePagePlan;
  edits: PdfEdit[];
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  freehandStyle: FreehandStyle;
  pendingSignatureImage: SignatureImage | null;
  eyedropperTarget: "stroke" | "fill" | null;
  onZoomChange: (documentId: string, delta: number) => void;
  onZoomSet: (documentId: string, zoom: number) => void;
  onScrollPositionChange: (documentId: string, scrollLeft: number, scrollTop: number) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onAddNativeText: (span: NativeTextSpan, text: string) => void;
  onAddShape: (pageNumber: number, shapeType: ShapeType, rect: PdfRect) => void;
  onAddFreehand: (pageNumber: number, points: import("./editing/types").PdfPoint[]) => void;
  onStartComment: (pageNumber: number, point: import("./editing/types").PdfPoint) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit) => void;
  onDeleteEdit: (editId: string) => void;
  onActivePageChange: (documentId: string, pageNumber: number) => void;
  onSampleColor: (color: string) => void;
  fontLibraryRevision: number;
  focusRequest: number;
  pageNavigationRequest: { pageNumber: number; requestId: number; commentId?: string } | null;
  viewerMode: ViewerMode;
  activePageNumber: number;
  shouldFitToPage: boolean;
  fitRefreshToken: number;
};

function PdfViewer({
  backendUrl,
  document,
  documents,
  pagePlan,
  edits,
  signatureImages,
  selectedEditId,
  activeTool,
  freehandStyle,
  pendingSignatureImage,
  eyedropperTarget,
  onZoomChange,
  onZoomSet,
  onScrollPositionChange,
  onAddText,
  onAddNativeText,
  onAddShape,
  onAddFreehand,
  onStartComment,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onDeleteEdit,
  onActivePageChange,
  onSampleColor,
  fontLibraryRevision,
  focusRequest,
  pageNavigationRequest,
  viewerMode,
  activePageNumber,
  shouldFitToPage,
  fitRefreshToken,
}: PdfViewerProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const lastFocusRequestRef = useRef<number | null>(null);
  const pageRefs = useRef(new Map<number, HTMLElement | null>());
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fitLayoutVersion, setFitLayoutVersion] = useState(0);
  const previousViewerModeRef = useRef<ViewerMode>(viewerMode);
  const pages = useMemo(
    () =>
      pagePlan.pages.flatMap((plannedPage) => {
        const sourceDocument = documents.find(
          (candidate) => candidate.id === plannedPage.sourceDocumentId,
        );
        return sourceDocument ? [{ ...plannedPage, sourceDocument }] : [];
      }),
    [documents, pagePlan.pages],
  );

  const registerPageRef = useCallback((pageNumber: number, node: HTMLElement | null) => {
    if (node === null) {
      pageRefs.current.delete(pageNumber);
      return;
    }

    pageRefs.current.set(pageNumber, node);
  }, []);

  const goToPage = useCallback((pageNumber: number) => {
    onActivePageChange(document.id, Math.min(pages.length, Math.max(1, pageNumber)));
  }, [document.id, onActivePageChange, pages.length]);

  const getCurrentPageNumber = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return 1;
    }

    const targetScrollTop = viewer.scrollTop + viewer.clientHeight / 2;
    let currentPageNumber = 1;

    for (const page of pages) {
      const pageElement = pageRefs.current.get(page.displayPageNumber);

      if (!pageElement) {
        continue;
      }

      const pageTop = pageElement.offsetTop;
      const pageBottom = pageTop + pageElement.offsetHeight;

      if (targetScrollTop >= pageTop && targetScrollTop < pageBottom) {
        return page.displayPageNumber;
      }

      if (targetScrollTop >= pageTop) {
        currentPageNumber = page.displayPageNumber;
      }
    }

    return currentPageNumber;
  }, [pages]);

  useEffect(() => {
    if (viewerMode === "continuous") {
      onActivePageChange(document.id, getCurrentPageNumber());
    }
  }, [document.id, getCurrentPageNumber, onActivePageChange, viewerMode]);

  const scrollPageIntoView = useCallback((pageNumber: number, direct = false) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(pageNumber)
      ?? viewer?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);

    if (!viewer || !pageElement) {
      return false;
    }

    if (direct) {
      const viewerBounds = viewer.getBoundingClientRect();
      const pageBounds = pageElement.getBoundingClientRect();
      if (pageBounds.height > 0 && viewerBounds.height > 0) {
        viewer.scrollTop = Math.max(0, viewer.scrollTop + pageBounds.top - viewerBounds.top - 8);
      } else {
        viewer.scrollTo({ top: pageElement.offsetTop, behavior: "smooth" });
      }
    } else {
      viewer.scrollTo({ top: pageElement.offsetTop, behavior: "smooth" });
    }
    return true;
  }, []);

  const scrollCommentIntoView = useCallback((pageNumber: number, commentId: string) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(pageNumber)
      ?? viewer?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);

    if (!viewer || !pageElement) {
      return false;
    }

    const marker = [...pageElement.querySelectorAll<HTMLElement>("[data-comment-id]")]
      .find((candidate) => candidate.dataset.commentId === commentId);

    if (!marker) {
      return false;
    }

    const viewerBounds = viewer.getBoundingClientRect();
    const markerBounds = marker.getBoundingClientRect();
    const annotationTop = viewer.scrollTop + markerBounds.top - viewerBounds.top;
    viewer.scrollTop = getAnnotationScrollTop({
      annotationTop,
      annotationHeight: markerBounds.height,
      viewportHeight: viewer.clientHeight,
      scrollHeight: viewer.scrollHeight,
    });
    return true;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.scrollLeft = document.scrollLeft;
    viewer.scrollTop = document.scrollTop;
  }, [document.id, document.scrollLeft, document.scrollTop]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewerMode === "continuous" || !shouldFitToPage) {
      return;
    }

    let frame = 0;
    const updateLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setFitLayoutVersion((currentVersion) => currentVersion + 1));
    };
    const observer = "ResizeObserver" in window ? new ResizeObserver(updateLayout) : null;
    observer?.observe(viewer);
    window.addEventListener("resize", updateLayout);
    updateLayout();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [shouldFitToPage, viewerMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const page = pages.find((candidate) => candidate.displayPageNumber === activePageNumber);

    if (!viewer || !page || viewerMode === "continuous" || !shouldFitToPage) {
      return;
    }

    let cancelled = false;
    void page.sourceDocument.pdfDocument.getPage(page.sourcePageIndex + 1).then((sourcePage) => {
      if (cancelled) return;
      const viewport = sourcePage.getViewport({
        scale: 1,
        rotation: ((sourcePage.rotate ?? 0) + page.rotation) % 360,
      });
      const navigationHeight = viewerMode === "presentation"
        ? 0
        : viewer.querySelector<HTMLElement>(".viewer-page-navigation")?.offsetHeight ?? 0;
      const scale = computeFitScale({
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        containerWidth: viewer.clientWidth,
        containerHeight: Math.max(1, viewer.clientHeight - navigationHeight),
        padding: viewerMode === "presentation" ? 0 : 20,
        minScale: MIN_ZOOM,
        maxScale: MAX_ZOOM,
      });
      onZoomSet(document.id, scale);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activePageNumber, document.id, fitLayoutVersion, fitRefreshToken, onZoomSet, pages, shouldFitToPage, viewerMode]);

  useEffect(() => {
    const previousViewerMode = previousViewerModeRef.current;
    previousViewerModeRef.current = viewerMode;

    if (viewerMode === "continuous" && previousViewerMode !== "continuous") {
      window.requestAnimationFrame(() => {
        scrollPageIntoView(activePageNumber, true);
      });
    }
  }, [activePageNumber, scrollPageIntoView, viewerMode]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer || lastFocusRequestRef.current === focusRequest) {
      return;
    }

    lastFocusRequestRef.current = focusRequest;
    viewer.focus();
  }, [document.id, focusRequest]);

  useEffect(() => {
    if (!pageNavigationRequest) {
      return;
    }
    goToPage(pageNavigationRequest.pageNumber);
    if (!pageNavigationRequest.commentId) {
      scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      const frame = window.requestAnimationFrame(() => {
        scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let attempts = 0;
    let retryTimer: number | null = null;
    const focusComment = () => {
      if (scrollCommentIntoView(pageNavigationRequest.pageNumber, pageNavigationRequest.commentId!)) {
        return;
      }
      scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      if (attempts++ < 20) {
        retryTimer = window.setTimeout(focusComment, 50);
      }
    };
    focusComment();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [goToPage, pageNavigationRequest, scrollCommentIntoView, scrollPageIntoView]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      onZoomChange(document.id, event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }

    viewer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewer.removeEventListener("wheel", handleWheel);
    };
  }, [document.id, onZoomChange]);

  useEffect(() => {
    const viewer = viewerRef.current;

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }

      if (viewer) {
        onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
      }
    };
  }, [document.id, onScrollPositionChange]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function finishDrag() {
      const viewer = viewerRef.current;

      if (!viewer || dragStateRef.current === null) {
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
    }

    function handleMove(event: globalThis.MouseEvent) {
      const viewer = viewerRef.current;
      const dragState = dragStateRef.current;

      if (!viewer || dragState === null) {
        return;
      }

      viewer.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX);
      viewer.scrollTop = dragState.startScrollTop - (event.clientY - dragState.startY);
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", finishDrag);
    window.addEventListener("blur", finishDrag);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("blur", finishDrag);
    };
  }, [document.id, isDragging, onScrollPositionChange]);

  const handleScroll = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer || scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
      onActivePageChange(document.id, getCurrentPageNumber());
    });
  }, [document.id, getCurrentPageNumber, onActivePageChange, onScrollPositionChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const viewer = viewerRef.current;

      if (!viewer) {
        return;
      }

      // Page unique and présentation are owned by the window-level navigation
      // listener so they never depend on focus remaining on this scroll area.
      if (viewerMode !== "continuous") {
        return;
      }

      const arrowStep = event.shiftKey ? 280 : VIEWER_PAN_STEP;
      const currentPageNumber = getCurrentPageNumber();
      const maxScrollTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          scrollViewerByDelta(viewer, -arrowStep, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          scrollViewerByDelta(viewer, arrowStep, 0);
          break;
        case "ArrowUp":
          event.preventDefault();
          scrollViewerByDelta(viewer, 0, -arrowStep);
          break;
        case "ArrowDown":
          event.preventDefault();
          scrollViewerByDelta(viewer, 0, arrowStep);
          break;
        case "PageUp":
          event.preventDefault();
          if (currentPageNumber > 1) {
            scrollPageIntoView(currentPageNumber - 1);
          }
          break;
        case "PageDown":
          event.preventDefault();
          if (currentPageNumber < pages.length) {
            scrollPageIntoView(currentPageNumber + 1);
          }
          break;
        case "Home":
          event.preventDefault();
          scrollViewerToPosition(viewer, viewer.scrollLeft, 0);
          break;
        case "End":
          event.preventDefault();
          scrollViewerToPosition(viewer, viewer.scrollLeft, maxScrollTop);
          break;
        default:
          return;
      }
    },
    [document.id, getCurrentPageNumber, pages.length, scrollPageIntoView, viewerMode],
  );

  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }

    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewer.scrollLeft,
      startScrollTop: viewer.scrollTop,
    };
    setIsDragging(true);
  }, []);

  return (
    <section
      ref={viewerRef}
      data-testid="pdf-viewer"
      tabIndex={0}
      className={
        isDragging
          ? "viewer viewer--pan-enabled is-panning"
          : viewerMode === "presentation"
            ? "viewer viewer--presentation"
            : viewerMode === "single-page"
              ? "viewer viewer--single-page viewer--pan-enabled"
          : activeTool !== "select"
            ? "viewer viewer--text-tool"
            : eyedropperTarget
              ? "viewer viewer--eyedropper"
              : "viewer viewer--pan-enabled"
      }
      aria-label={`Aperçu PDF ${document.fileName}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    >
      {document.error ? <p className="status">{document.error}</p> : null}
      <div className="pdf-document" aria-label={`Document PDF ${document.fileName}`}>
        {(viewerMode === "continuous" ? pages : pages.filter((page) => page.displayPageNumber === activePageNumber)).map((page) => {
          const isActiveDocumentSource = page.sourceDocumentId === document.id;
          const nativeTextRuntimeActive =
            isActiveDocumentSource &&
            activeTool === "edit_text" &&
            viewerMode !== "presentation" &&
            page.displayPageNumber === activePageNumber;
          return (
            <PdfPageCanvas
              key={page.id}
              backendUrl={backendUrl}
              sourceFile={page.sourceDocument.file}
              pdfDocument={page.sourceDocument.pdfDocument}
              sourcePageNumber={page.sourcePageIndex + 1}
              displayPageNumber={page.displayPageNumber}
              rotation={page.rotation}
              zoom={document.zoom}
              edits={
                viewerMode !== "presentation" && isActiveDocumentSource
                  ? edits.filter(
                      (edit) => edit.page === page.sourcePageIndex + 1,
                    )
                  : []
              }
              signatureImages={signatureImages}
              selectedEditId={viewerMode === "presentation" ? null : selectedEditId}
              activeTool={viewerMode === "presentation" ? "select" : isActiveDocumentSource ? activeTool : "select"}
              nativeTextRuntimeActive={nativeTextRuntimeActive}
              freehandStyle={freehandStyle}
              pendingSignatureImage={
                viewerMode !== "presentation" && isActiveDocumentSource ? pendingSignatureImage : null
              }
              eyedropperTarget={isActiveDocumentSource ? eyedropperTarget : null}
              scrollRootRef={viewerRef}
              registerPageRef={registerPageRef}
              onAddText={onAddText}
              onAddNativeText={onAddNativeText}
                onAddShape={onAddShape}
                onAddFreehand={onAddFreehand}
                onStartComment={onStartComment}
              onPlaceSignature={onPlaceSignature}
              onSelectEdit={onSelectEdit}
              onDeselectEdit={onDeselectEdit}
              onUpdateEdit={onUpdateEdit}
              onDeleteEdit={onDeleteEdit}
              onSampleColor={onSampleColor}
              fontLibraryRevision={fontLibraryRevision}
            />
          );
        })}
      </div>
      {viewerMode === "single-page" ? (
        <nav className="viewer-page-navigation" aria-label="Navigation des pages">
          <button
            type="button"
            onClick={() => goToPage(activePageNumber - 1)}
            disabled={activePageNumber <= 1}
            aria-label="Page précédente"
            title="Page précédente"
          >
            ←
          </button>
          <output aria-label={`Page ${activePageNumber} sur ${pages.length}`}>{activePageNumber} / {pages.length}</output>
          <button
            type="button"
            onClick={() => goToPage(activePageNumber + 1)}
            disabled={activePageNumber >= pages.length}
            aria-label="Page suivante"
            title="Page suivante"
          >
            →
          </button>
        </nav>
      ) : null}
    </section>
  );
}

type OrganizePageThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  page: OrganizedPage;
};

function OrganizePageThumbnail({ pdfDocument, page }: OrganizePageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    async function renderThumbnail() {
      setRenderState("loading");

      try {
        const pdfPage = await pdfDocument.getPage(page.sourcePageIndex + 1);
        const renderCanvas = canvasRef.current;

        if (isCancelled || !renderCanvas) {
          return;
        }

        const viewport = pdfPage.getViewport({ scale: 0.24, rotation: page.rotation });
        const context = renderCanvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const outputScale = window.devicePixelRatio || 1;
        renderCanvas.width = Math.floor(viewport.width * outputScale);
        renderCanvas.height = Math.floor(viewport.height * outputScale);
        renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
        renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = pdfPage.render({ canvas: renderCanvas, canvasContext: context, viewport });
        await renderTask.promise;

        if (!isCancelled) {
          setRenderState("ready");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setRenderState("error");
        }
      }
    }

    void renderThumbnail();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      clearCanvas(canvas);
    };
  }, [page.rotation, page.sourcePageIndex, pdfDocument]);

  return (
    <div className="organize-thumbnail" aria-label={`Miniature de la page source ${page.sourcePageIndex + 1}`}>
      {renderState !== "ready" && renderState !== "error" ? (
        <span className="organize-thumbnail__placeholder" aria-hidden="true">
          {renderState === "loading" ? "Chargement…" : ""}
        </span>
      ) : null}
      {renderState === "error" ? <span className="organize-thumbnail__error">Aperçu indisponible</span> : null}
      <canvas ref={canvasRef} className="organize-thumbnail__canvas" />
    </div>
  );
}

type ExternalPageThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
};

function ExternalPageThumbnail({ pdfDocument, pageNumber }: ExternalPageThumbnailProps) {
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  useEffect(() => {
    const thumbnail = thumbnailRef.current;

    if (!thumbnail || !("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px", threshold: 0.01 },
    );
    observer.observe(thumbnail);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;

    if (!shouldRender || !canvas) {
      return;
    }

    async function renderThumbnail() {
      setRenderState("loading");

      try {
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const renderCanvas = canvasRef.current;

        if (isCancelled || !renderCanvas) {
          return;
        }

        const viewport = pdfPage.getViewport({ scale: 0.12 });
        const context = renderCanvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const outputScale = window.devicePixelRatio || 1;
        renderCanvas.width = Math.floor(viewport.width * outputScale);
        renderCanvas.height = Math.floor(viewport.height * outputScale);
        renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
        renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = pdfPage.render({ canvas: renderCanvas, canvasContext: context, viewport });
        await renderTask.promise;

        if (!isCancelled) {
          setRenderState("ready");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setRenderState("error");
        }
      }
    }

    void renderThumbnail();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      clearCanvas(canvas);
    };
  }, [pageNumber, pdfDocument, shouldRender]);

  return (
    <div ref={thumbnailRef} className="external-page-thumbnail" aria-label={`Miniature externe de la page ${pageNumber}`}>
      {renderState !== "ready" && renderState !== "error" ? (
        <span className="external-page-thumbnail__placeholder" aria-hidden="true">
          {renderState === "loading" ? "Chargement…" : ""}
        </span>
      ) : null}
      {renderState === "error" ? <span className="external-page-thumbnail__fallback">Page {pageNumber}</span> : null}
      <canvas ref={canvasRef} className="external-page-thumbnail__canvas" />
    </div>
  );
}

type OrganizePagesProps = {
  document: OpenPdfDocument;
  documents: OpenPdfDocument[];
  plan: OrganizePagePlan;
  selectedPageId: string | null;
  outputName: string;
  saveToOutputDir: boolean;
  isExporting: boolean;
  exportFeedback: ExportFeedback | null;
  onToggleSelection: (pageId: string) => void;
  onMovePageByIndex: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onRotatePage: (pageId: string) => void;
  onReset: () => void;
  onOutputNameChange: (outputName: string) => void;
  onSaveToOutputDirChange: (saveToOutputDir: boolean) => void;
  onExport: () => void;
  onAddExternalPages: (sourceDocumentId: string, sourcePageIndexes: number[]) => void;
  onDismissExportFeedback: () => void;
  onRemoveMissingSourcePages: () => void;
};

type OrganizeIconName = "check" | "rotate" | "trash" | "left" | "right" | "duplicate";

function OrganizeIcon({ name }: { name: OrganizeIconName }) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg className="organize-icon" focusable="false" {...commonProps}>
      {name === "check" ? <path d="m4 10 3.5 3.5L16 5.5" /> : null}
      {name === "rotate" ? (
        <>
          <path d="M15.5 8A6 6 0 1 0 16 12" />
          <path d="M15.5 4.5V8H12" />
        </>
      ) : null}
      {name === "trash" ? (
        <>
          <path d="M4.5 6h11" />
          <path d="M8 3.5h4" />
          <path d="m6.5 6 .7 10h5.6l.7-10" />
          <path d="M9 9v4" />
          <path d="M11 9v4" />
        </>
      ) : null}
      {name === "left" ? <path d="m11.5 4-6 6 6 6" /> : null}
      {name === "right" ? <path d="m8.5 4 6 6-6 6" /> : null}
      {name === "duplicate" ? (
        <>
          <rect x="7" y="7" width="9" height="9" rx="1" />
          <path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
        </>
      ) : null}
    </svg>
  );
}

function OrganizePages({
  document,
  documents,
  plan,
  selectedPageId,
  outputName,
  saveToOutputDir,
  isExporting,
  exportFeedback,
  onToggleSelection,
  onMovePageByIndex,
  onDeletePage,
  onDuplicatePage,
  onRotatePage,
  onReset,
  onOutputNameChange,
  onSaveToOutputDirChange,
  onExport,
  onAddExternalPages,
  onDismissExportFeedback,
  onRemoveMissingSourcePages,
}: OrganizePagesProps) {
  const hasPendingChanges = isPlanModified(plan, document.pageCount);
  const canReset = hasPendingChanges || selectedPageId !== null;
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropPageId, setDropPageId] = useState<string | null>(null);
  const [isAddPagesOpen, setIsAddPagesOpen] = useState(false);
  const [selectedExternalDocumentId, setSelectedExternalDocumentId] = useState("");
  const [selectedExternalPageIndexes, setSelectedExternalPageIndexes] = useState<number[]>([]);
  const additionalDocuments = documents.filter((openDocument) => openDocument.id !== document.id);
  const selectedExternalDocument =
    additionalDocuments.find((openDocument) => openDocument.id === selectedExternalDocumentId) ??
    additionalDocuments[0] ??
    null;
  const missingSourceDocuments = [...new Map(
    plan.pages
      .filter((page) => !documents.some((openDocument) => openDocument.id === page.sourceDocumentId))
      .map((page) => [page.sourceDocumentId, page.sourceDocumentName || "PDF sans nom"]),
  ).values()];
  const hasMissingSources = missingSourceDocuments.length > 0;
  const sourceSummaryByDocument = new Map<string, { fileName: string; pageCount: number }>();

  plan.pages.forEach((page) => {
    const source = sourceSummaryByDocument.get(page.sourceDocumentId);

    sourceSummaryByDocument.set(page.sourceDocumentId, {
      fileName: page.sourceDocumentName,
      pageCount: (source?.pageCount ?? 0) + 1,
    });
  });
  const sourceSummary = [...sourceSummaryByDocument.entries()];

  useEffect(() => {
    setSelectedExternalPageIndexes([]);
  }, [selectedExternalDocument?.id]);

  const handleDragStart = (event: DragEvent<HTMLElement>, pageId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedPageId(pageId);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetPageId: string) => {
    event.preventDefault();
    const sourcePageId = event.dataTransfer.getData("text/plain") || draggedPageId;
    const sourceIndex = plan.pages.findIndex((page) => page.id === sourcePageId);
    const targetIndex = plan.pages.findIndex((page) => page.id === targetPageId);

    if (sourceIndex >= 0 && targetIndex >= 0) {
      onMovePageByIndex(sourceIndex, targetIndex);
    }

    setDraggedPageId(null);
    setDropPageId(null);
  };

  return (
    <section className="organize-workspace" aria-label={`Organiser les pages de ${document.fileName}`}>
      <header className="organize-header">
        <div>
          <h2>Organiser les pages</h2>
          <p>Modifications locales uniquement — les PDF originaux restent inchangés.</p>
        </div>
        <div className="organize-export-bar" aria-label="Plan d'export">
          <label className="organize-export-name">
            <span>Nom final</span>
            <input
              type="text"
              value={outputName}
              onChange={(event) => onOutputNameChange(event.target.value)}
              aria-label="Nom du PDF exporté"
              placeholder="document-modifie.pdf"
            />
          </label>
          <span className="organize-page-count" aria-label={`${plan.pages.length} pages seront exportées`}>
            <strong>{plan.pages.length}</strong> {plan.pages.length > 1 ? "pages" : "page"}
          </span>
          <span className={hasPendingChanges ? "organize-changes is-pending" : "organize-changes"}>
            {hasPendingChanges ? "Modifié" : "Ordre d'origine"}
          </span>
          <label className="organize-export-output-option">
            <input
              type="checkbox"
              checked={saveToOutputDir}
              onChange={(event) => onSaveToOutputDirChange(event.target.checked)}
            />
            Copier dans data/output
          </label>
          <button
            type="button"
            className="organize-reset-button"
            onClick={onReset}
            disabled={!canReset}
            aria-label="Réinitialiser l'organisation"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            className="organize-export-button"
            onClick={onExport}
            disabled={plan.pages.length === 0 || isExporting || hasMissingSources}
          >
            {isExporting ? <span className="organize-spinner" aria-hidden="true" /> : null}
            {isExporting ? "Export en cours…" : "Exporter le PDF"}
          </button>
        </div>
      </header>

      <section className="organize-source-summary" aria-label="Sources du plan d'export">
        <span className="organize-source-summary__label">Sources</span>
        {sourceSummary.map(([sourceDocumentId, source]) => (
          <span key={sourceDocumentId} className="organize-source-summary__item" title={source.fileName}>
            {source.fileName} : {source.pageCount} {source.pageCount > 1 ? "pages" : "page"}
          </span>
        ))}
      </section>

      {hasMissingSources ? (
        <div className="organize-feedback organize-feedback--error" role="alert">
          <div>
            <strong>Des documents sources sont indisponibles.</strong>
            <span title={missingSourceDocuments.join(", ")}>
              Export impossible tant que ces pages sont présentes : {missingSourceDocuments.join(", ")}.
            </span>
          </div>
          <div className="organize-feedback__actions">
            <button type="button" onClick={onRemoveMissingSourcePages}>
              Retirer les pages indisponibles
            </button>
            <button type="button" onClick={onReset}>
              Réinitialiser le plan
            </button>
          </div>
        </div>
      ) : null}

      <section className="organize-add-pages" aria-label="Ajout de pages externes">
        {additionalDocuments.length > 0 ? (
          <>
          <button
            type="button"
            onClick={() => setIsAddPagesOpen((isOpen) => !isOpen)}
            aria-expanded={isAddPagesOpen}
          >
            Ajouter depuis un PDF ouvert
          </button>
          {isAddPagesOpen ? (
            <div className="organize-add-pages__panel">
              <label className="organize-add-pages__source">
                <span>PDF source</span>
                <select
                  value={selectedExternalDocument?.id ?? ""}
                  aria-label="PDF source externe"
                  onChange={(event) => {
                    setSelectedExternalDocumentId(event.target.value);
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  {additionalDocuments.map((sourceDocument) => (
                    <option key={sourceDocument.id} value={sourceDocument.id}>
                      {sourceDocument.fileName}
                    </option>
                  ))}
                </select>
              </label>
              {selectedExternalDocument && selectedExternalDocument.pageCount > 0 ? (
                <div className="external-page-grid" aria-label="Miniatures des pages externes">
                  {Array.from({ length: selectedExternalDocument.pageCount }, (_, sourcePageIndex) => {
                    const isSelected = selectedExternalPageIndexes.includes(sourcePageIndex);

                    return (
                      <button
                        key={sourcePageIndex}
                        type="button"
                        className={isSelected ? "external-page is-selected" : "external-page"}
                        aria-label={`Ajouter ${selectedExternalDocument.fileName}, page ${sourcePageIndex + 1}`}
                        aria-pressed={isSelected}
                        title={`${selectedExternalDocument.fileName} — page ${sourcePageIndex + 1}`}
                        onClick={() => {
                          setSelectedExternalPageIndexes((currentIndexes) =>
                            isSelected
                              ? currentIndexes.filter((index) => index !== sourcePageIndex)
                              : [...currentIndexes, sourcePageIndex],
                          );
                        }}
                      >
                        <ExternalPageThumbnail
                          pdfDocument={selectedExternalDocument.pdfDocument}
                          pageNumber={sourcePageIndex + 1}
                        />
                        <span className="external-page__footer">
                          <span>Page {sourcePageIndex + 1}</span>
                          <span className="external-page__check" aria-hidden="true">✓</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : selectedExternalDocument ? (
                <p className="organize-add-pages__empty">Ce PDF ne contient aucune page disponible.</p>
              ) : null}
              <div className="organize-add-pages__actions">
                <button
                  type="button"
                  disabled={!selectedExternalDocument || selectedExternalPageIndexes.length === 0}
                  onClick={() => {
                    if (!selectedExternalDocument) {
                      return;
                    }

                    onAddExternalPages(selectedExternalDocument.id, selectedExternalPageIndexes);
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  Ajouter les pages sélectionnées
                </button>
                <button
                  type="button"
                  disabled={!selectedExternalDocument}
                  onClick={() => {
                    if (!selectedExternalDocument) {
                      return;
                    }

                    onAddExternalPages(
                      selectedExternalDocument.id,
                      Array.from({ length: selectedExternalDocument.pageCount }, (_, pageIndex) => pageIndex),
                    );
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  Tout ajouter
                </button>
              </div>
            </div>
          ) : null}
          </>
        ) : (
          <p>Ouvrez un autre PDF pour ajouter ses pages à la fin du plan.</p>
        )}
      </section>

      {isExporting ? (
        <div className="organize-feedback organize-feedback--progress" role="status">
          <span className="organize-spinner" aria-hidden="true" />
          Export en cours…
        </div>
      ) : null}

      {exportFeedback ? (
        <div
          className={`organize-feedback organize-feedback--${exportFeedback.kind}`}
          role={exportFeedback.kind === "error" ? "alert" : "status"}
        >
          <span>{exportFeedback.message}</span>
          <button type="button" onClick={onDismissExportFeedback} aria-label="Fermer le message d'export">
            Fermer
          </button>
        </div>
      ) : null}

      {plan.pages.length > 0 ? (
        <div className="organize-grid" aria-label="Grille des pages organisées">
          {plan.pages.map((page, index) => {
            const selected = page.id === selectedPageId;
            const pageLabel = `Page ${page.displayPageNumber}`;
            const sourceDocument = documents.find((openDocument) => openDocument.id === page.sourceDocumentId);

            return (
              <article
                key={page.id}
                data-testid="organized-page"
                data-source-document-id={page.sourceDocumentId}
                data-source-page-index={page.sourcePageIndex}
                data-rotation={page.rotation}
                draggable
                className={[
                  "organize-page",
                  selected ? "is-selected" : "",
                  draggedPageId === page.id ? "is-dragging" : "",
                  dropPageId === page.id && draggedPageId !== page.id ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={pageLabel}
                aria-selected={selected}
                onDragStart={(event) => handleDragStart(event, page.id)}
                onDragEnd={() => {
                  setDraggedPageId(null);
                  setDropPageId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropPageId(page.id);
                }}
                onDragLeave={() => setDropPageId((currentPageId) => (currentPageId === page.id ? null : currentPageId))}
                onDrop={(event) => handleDrop(event, page.id)}
              >
                {sourceDocument ? (
                  <OrganizePageThumbnail pdfDocument={sourceDocument.pdfDocument} page={page} />
                ) : (
                  <div className="organize-thumbnail organize-thumbnail--missing">
                    Source indisponible
                  </div>
                )}
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__select"
                  onClick={() => onToggleSelection(page.id)}
                  aria-label={`Sélectionner la page ${page.displayPageNumber}`}
                  aria-pressed={selected}
                  title={selected ? "Désélectionner la page" : "Sélectionner la page"}
                >
                  <OrganizeIcon name="check" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__rotate"
                  onClick={() => onRotatePage(page.id)}
                  aria-label={`Tourner la page ${page.displayPageNumber} vers la droite`}
                  title="Tourner de 90° vers la droite"
                >
                  <OrganizeIcon name="rotate" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__move organize-page__move--left"
                  onClick={() => onMovePageByIndex(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Déplacer la page ${page.displayPageNumber} vers la gauche`}
                  title="Déplacer d'un cran vers la gauche"
                >
                  <OrganizeIcon name="left" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__move organize-page__move--right"
                  onClick={() => onMovePageByIndex(index, index + 1)}
                  disabled={index === plan.pages.length - 1}
                  aria-label={`Déplacer la page ${page.displayPageNumber} vers la droite`}
                  title="Déplacer d'un cran vers la droite"
                >
                  <OrganizeIcon name="right" />
                </button>
                <div className="organize-page__bottom-actions">
                  <button
                    type="button"
                    className="organize-page__icon-button"
                    onClick={() => onDuplicatePage(page.id)}
                    aria-label={`Dupliquer la page ${page.displayPageNumber}`}
                    title="Dupliquer la page"
                  >
                    <OrganizeIcon name="duplicate" />
                  </button>
                  <button
                    type="button"
                    className="organize-page__icon-button organize-page__delete"
                    onClick={() => onDeletePage(page.id)}
                    aria-label={`Supprimer la page ${page.displayPageNumber}`}
                    title="Retirer du plan d'organisation"
                  >
                    <OrganizeIcon name="trash" />
                  </button>
                </div>
                <div className="organize-page__meta">
                  <strong>{pageLabel}</strong>
                  <span className="organize-page__source" title={`${page.sourceDocumentName} — p. ${page.sourcePageIndex + 1}`}>
                    {page.sourceDocumentName} — p. {page.sourcePageIndex + 1}
                  </span>
                  {page.rotation !== 0 ? <span>Rotation : {page.rotation}°</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="organize-empty-state">
          <p>Toutes les pages ont été retirées du plan.</p>
          <button type="button" onClick={onReset}>
            Réinitialiser l'organisation
          </button>
        </div>
      )}
    </section>
  );
}

type SidebarPageListProps = {
  documents: OpenPdfDocument[];
  pagePlan: OrganizePagePlan;
  activePageNumber: number;
  onSelectPage: (pageNumber: number) => void;
  pageView: "list" | "grid";
};

function SidebarPageList({
  documents,
  pagePlan,
  activePageNumber,
  onSelectPage,
  pageView,
}: SidebarPageListProps) {
  return (
    <ol className={`sidebar-page-list sidebar-page-list--${pageView}`} aria-label="Pages du document">
      {pagePlan.pages.map((page) => {
        const sourceDocument = documents.find(
          (document) => document.id === page.sourceDocumentId,
        );
        if (!sourceDocument) {
          return null;
        }
        return (
          <li key={page.id}>
            <button
              type="button"
              className={
                page.displayPageNumber === activePageNumber
                  ? "sidebar-page is-active"
                  : "sidebar-page"
              }
              aria-label={`Aller à la page ${page.displayPageNumber}`}
              aria-current={
                page.displayPageNumber === activePageNumber ? "page" : undefined
              }
              onClick={() => onSelectPage(page.displayPageNumber)}
            >
              <OrganizePageThumbnail
                pdfDocument={sourceDocument.pdfDocument}
                page={page}
              />
              <span>{page.displayPageNumber}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type DocumentTabsProps = {
  documents: OpenPdfDocument[];
  activeDocumentId: string | null;
  dirtyDocumentIds: ReadonlySet<string>;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  getDocumentButtonRef: (documentId: string) => (node: HTMLButtonElement | null) => void;
};

function DocumentTabs({
  documents,
  activeDocumentId,
  dirtyDocumentIds,
  onSelectDocument,
  onCloseDocument,
  onKeyDown,
  getDocumentButtonRef,
}: DocumentTabsProps) {
  return (
    <nav className="document-tabs" aria-label="Documents ouverts" onKeyDown={onKeyDown}>
      <div className="document-tabs__scroll" aria-label="Documents ouverts">
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId;
          const isDirty = dirtyDocumentIds.has(document.id);
          return (
            <div key={document.id} className={isActive ? "document-tab is-active" : "document-tab"}>
              <button
                type="button"
                className="document-select"
                data-document-id={document.id}
                ref={getDocumentButtonRef(document.id)}
                onClick={() => onSelectDocument(document.id)}
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${document.fileName}${isActive ? ", document actif" : ""}`}
                aria-describedby={isDirty ? `document-dirty-${document.id}` : undefined}
                tabIndex={isActive ? 0 : -1}
                title={document.fileName}
              >
                <span className="document-title">{document.fileName}</span>
                {isDirty ? <span className="document-tab__dirty" title="Modifications non sauvegardées" aria-hidden="true">●</span> : null}
                {isDirty ? <span id={`document-dirty-${document.id}`} className="visually-hidden">Modifications non sauvegardées.</span> : null}
              </button>
              <button
                type="button"
                className="document-close"
                data-document-id={document.id}
                onClick={() => onCloseDocument(document.id)}
                aria-label={`Fermer ${document.fileName}`}
                title="Fermer"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function DocumentSidebar({
  documents,
  openFileInputRef,
  activePageNumber,
  pagePlan,
  onSelectPage,
  onFileChange,
  status,
  storageWarning,
  sidebarId,
  onKeyDown,
  pageView,
  onPageViewChange,
  comments,
  commentsView,
  selectedCommentId,
  onCommentsViewChange,
  onSelectComment,
}: DocumentSidebarProps) {
  return (
    <aside
      id={sidebarId}
      tabIndex={0}
      className="document-sidebar"
      aria-label="Documents ouverts"
      onKeyDown={onKeyDown}
    >
      <div className="sidebar-header">
        <div className="sidebar-section-tabs" role="tablist" aria-label="Navigation latérale">
          <button type="button" role="tab" aria-selected={!commentsView} onClick={() => onCommentsViewChange(false)}>Pages</button>
          <button type="button" role="tab" aria-selected={commentsView} onClick={() => onCommentsViewChange(true)}><span>Commentaires</span>{comments.length > 0 ? <span className="sidebar-tab-badge" aria-label={`${comments.length} commentaires`}>{comments.length}</span> : null}</button>
        </div>
        {!commentsView ? <div className="sidebar-page-view" role="group" aria-label="Affichage des pages">
          <button type="button" aria-label="Vue liste" aria-pressed={pageView === "list"} onClick={() => onPageViewChange("list")}>▤</button>
          <button type="button" aria-label="Vue grille" aria-pressed={pageView === "grid"} onClick={() => onPageViewChange("grid")}>▦</button>
          <span className="sidebar-count">{pagePlan?.pages.length ?? 0}</span>
        </div> : null}
      </div>

      <div className="document-sidebar__content">
        <div className="document-sidebar__scroll-area">
          {commentsView ? (
            comments.length ? <ol className="comment-list" aria-label="Commentaires">{[...comments].sort((left, right) => left.page - right.page || left.rect.y0 - right.rect.y0).map((comment) => <li key={comment.id}><button type="button" className={comment.id === selectedCommentId ? "is-selected" : ""} onClick={() => onSelectComment(comment)}><strong>Page {comment.page}</strong><span>{comment.content}</span></button></li>)}</ol> : <p className="sidebar-hint">Aucun commentaire dans ce document.</p>
          ) : pagePlan && pagePlan.pages.length > 0 ? (
            <SidebarPageList
              documents={documents}
              pagePlan={pagePlan}
              activePageNumber={activePageNumber}
              onSelectPage={onSelectPage}
              pageView={pageView}
            />
          ) : (
            <p className="sidebar-hint">{documents.length === 0 ? "Aucun document ouvert." : "Ouvrez un PDF pour afficher ses pages."}</p>
          )}

          {status ? <p className="sidebar-status">{status}</p> : null}
          {storageWarning ? (
            <p className="sidebar-status" role="alert">
              {storageWarning}
            </p>
          ) : null}

        </div>
      </div>
      <input
        ref={openFileInputRef}
        className="visually-hidden"
        data-testid="pdf-file-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={onFileChange}
        aria-label="Ouvrir un PDF"
      />
    </aside>
  );
}

function ResetIcon() {
  return (
    <svg
      className="danger-button__icon"
      aria-hidden="true"
      viewBox="0 0 20 20"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.2 8.2A6 6 0 0 1 16 10.4" />
      <path d="M16.4 6.2v4.2h-4.2" />
      <path d="M14.8 11.8A6 6 0 0 1 4 9.6" />
      <path d="M3.6 13.8V9.6h4.2" />
    </svg>
  );
}

type ToolbarIconName =
  | "save-as"
  | "open"
  | "select"
  | "text"
  | "signature"
  | "shape"
  | "freehand"
  | "comment"
  | "organize"
  | "ocr"
  | "conversion"
  | "undo"
  | "redo";

function ToolbarIcon({ name }: { name: ToolbarIconName }) {
  return (
    <svg
      className="toolbar-icon"
      aria-hidden="true"
      viewBox="0 0 20 20"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "save-as" ? (
        <>
          <path d="M4 3h10l2 2v12H4z" />
          <path d="M7 3v5h6V3" />
          <path d="M7 17v-5h6v5" />
        </>
      ) : null}
      {name === "open" ? <><path d="M3 6h5l1.5 2H17v8H3z" /><path d="M10 11h5m-2.5-2.5v5" /></> : null}
      {name === "text" ? (
        <>
          <path d="M4 6V3h12v3" />
          <path d="M10 3v14" />
          <path d="M7 17h6" />
        </>
      ) : null}
      {name === "select" ? (
        <path d="m5 3 9.5 8.1-4.2.8 2.3 4.1-2.4 1.3-2.2-4-3 3z" />
      ) : null}
      {name === "signature" ? (
        <>
          <path d="M3 14c2.4-4.8 3.9-7.2 5.1-7.2 1.9 0-.9 7.5.8 7.5 1.1 0 2.1-3.5 3.2-3.5.7 0 .2 3.2 1.2 3.2.6 0 1.4-1.4 2.1-1.4.6 0 .7.8 1.6.8" />
          <path d="M3 17h14" />
        </>
      ) : null}
      {name === "shape" ? (
        <>
          <rect x="3" y="4" width="7" height="7" rx="1" />
          <circle cx="13.5" cy="13.5" r="3.5" />
        </>
      ) : null}
      {name === "freehand" ? <path d="M3 15c2-6 3.5-8 5-8 1.8 0-.8 7 1 7 1.5 0 2-5 3.4-5 .9 0-.1 4 1.3 4 .8 0 1.2-1.3 2.3-1.3M3 17h14" /> : null}
      {name === "comment" ? <path d="M3 3h14v10H8l-5 4V3Z" /> : null}
      {name === "organize" ? (
        <>
          <rect x="3" y="3" width="5" height="6" rx="1" />
          <rect x="12" y="3" width="5" height="6" rx="1" />
          <rect x="7.5" y="11" width="5" height="6" rx="1" />
        </>
      ) : null}
      {name === "ocr" ? (
        <>
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
          <path d="M6 10h8M10 6v8" />
        </>
      ) : null}
      {name === "conversion" ? (
        <>
          <path d="M3 7h11m-3-3 3 3-3 3" />
          <path d="M17 13H6m3-3-3 3 3 3" />
        </>
      ) : null}
      {name === "undo" ? (
        <path d="M7 6 3.5 9.5 7 13M4 9.5h6a5 5 0 0 1 5 5" />
      ) : null}
      {name === "redo" ? (
        <path d="m13 6 3.5 3.5L13 13m3-3.5h-6a5 5 0 0 0-5 5" />
      ) : null}
    </svg>
  );
}

type EmptyStateProps = {
  status: string;
  mode: WorkspaceMode;
};

function EmptyState({ status, mode }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label="Aucun PDF ouvert">
      <p className="status">{status}</p>
      <p>
        {mode === "organize"
          ? "Ouvrez un PDF pour organiser ses pages."
          : "Le panneau de gauche listera vos documents ouverts."}
      </p>
      {mode === "organize" ? (
        <button type="button" disabled>
          Exporter le PDF
        </button>
      ) : null}
    </section>
  );
}

type AppProps = {
  backendUrl?: string;
};

export function App({ backendUrl = getWebBackendBaseUrl() }: AppProps = {}) {
  const storedPreferences = useMemo(() => loadViewerPreferences(), []);
  const nextDocumentId = useRef(1);
  const documentsRef = useRef<OpenPdfDocument[]>([]);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const presentationContainerRef = useRef<HTMLElement | null>(null);
  const documentButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocusTargetRef = useRef<FocusTarget>(null);
  const sidebarId = "documents-sidebar";
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme(storedPreferences));
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => storedPreferences?.sidebarVisible ?? true);
  const [pageView, setPageView] = useState<"list" | "grid">("list");
  const [isPropertiesPanelVisible, setIsPropertiesPanelVisible] = useState(true);
  const [propertiesPanelWidth, setPropertiesPanelWidth] = useState(272);
  const [isShapePickerOpen, setIsShapePickerOpen] = useState(false);
  const [textMarkupSelection, setTextMarkupSelection] = useState<{ page: number; rects: PdfRect[]; top: number; left: number } | null>(null);
  const [textMarkupColor, setTextMarkupColor] = useState("#eab308");
  const [pendingComment, setPendingComment] = useState<{ page: number; point: import("./editing/types").PdfPoint } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthorDraft, setCommentAuthorDraft] = useState(() => storedPreferences?.commentAuthor ?? "");
  const [lastCommentAuthor, setLastCommentAuthor] = useState(() => storedPreferences?.commentAuthor ?? "");
  const [isCommentsView, setIsCommentsView] = useState(false);
  const [shapePickerPosition, setShapePickerPosition] = useState({ top: 0, left: 0 });
  const shapePickerButtonRef = useRef<HTMLButtonElement | null>(null);
  const shapePickerRef = useRef<HTMLDivElement | null>(null);
  const [documents, setDocuments] = useState<OpenPdfDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("read");
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    () => storedPreferences?.viewerMode ?? "continuous",
  );
  const [fitToPageByDocument, setFitToPageByDocument] = useState<Record<string, boolean>>({});
  const [presentationFitRefreshToken, setPresentationFitRefreshToken] = useState(0);
  const [activeEditingTool, setActiveEditingTool] =
    useState<EditingTool>("select");
  const [freehandToolStyle, setFreehandToolStyle] = useState<FreehandStyle>(
    DEFAULT_FREEHAND_STYLE,
  );
  const [pdfEditsByDocument, dispatchPdfEdits] = useReducer(
    pdfEditsReducer,
    {},
  );
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [fontLibraryRevision, setFontLibraryRevision] = useState(0);
  const [eyedropperTarget, setEyedropperTarget] = useState<
    "stroke" | "fill" | null
  >(null);
  const clipboardEditRef = useRef<PdfEdit | null>(null);
  const pasteSequenceRef = useRef(0);
  const activePageByDocumentRef = useRef<Record<string, number>>({});
  const pageNavigationRequestId = useRef(0);
  const [activePageByDocument, setActivePageByDocument] = useState<
    Record<string, number>
  >({});
  const [pageNavigationRequest, setPageNavigationRequest] = useState<{
    pageNumber: number;
    requestId: number;
    commentId?: string;
  } | null>(null);
  const [signatureImages, setSignatureImages] = useState<
    Record<string, SignatureImage>
  >({});
  const [pendingSignatureImageId, setPendingSignatureImageId] = useState<
    string | null
  >(null);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [saveAsDocumentId, setSaveAsDocumentId] = useState<string | null>(null);
  const [pendingCloseDocumentId, setPendingCloseDocumentId] = useState<
    string | null
  >(null);
  const [closeAfterSaveDocumentId, setCloseAfterSaveDocumentId] = useState<
    string | null
  >(null);
  const [organizationPlans, setOrganizationPlans] = useState<Record<string, OrganizePagePlan>>({});
  const [selectedPageIdsByDocument, setSelectedPageIdsByDocument] = useState<Record<string, string | null>>({});
  const [outputName, setOutputName] = useState("");
  const [saveToOutputDir, setSaveToOutputDir] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(null);
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [status, setStatus] = useState("Sélectionnez un PDF local.");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [viewerFocusRequest, setViewerFocusRequest] = useState(0);
  const nextOrganizedPageId = useRef(1);
  const nextTextEditId = useRef(1);
  const nextNativeTextEditId = useRef(1);
  const nextShapeEditId = useRef(1);
  const nextFreehandEditId = useRef(1);
  const nextTextMarkupEditId = useRef(1);
  const nextCommentEditId = useRef(1);
  const textMarkupToolbarRef = useRef<HTMLDivElement | null>(null);
  const nextSignatureImageId = useRef(1);
  const nextSignatureEditId = useRef(1);
  const [isRestoringDocuments, setIsRestoringDocuments] = useState(
    () => (storedPreferences?.documentOrder.length ?? 0) > 0,
  );
  const [restorationError, setRestorationError] = useState<string | null>(null);
  const [restorationAttempt, setRestorationAttempt] = useState(0);
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );
  const activeDocumentIndex = useMemo(
    () => documents.findIndex((document) => document.id === activeDocumentId),
    [activeDocumentId, documents],
  );
  const activeOrganizationPlan = useMemo(() => {
    if (!activeDocument) {
      return null;
    }

    return (
      organizationPlans[activeDocument.id] ??
      createInitialPagePlan(activeDocument.id, activeDocument.fileName, activeDocument.pageCount)
    );
  }, [activeDocument, organizationPlans]);
  const activePageNumber = activeDocument
    ? Math.min(
        Math.max(1, activePageByDocument[activeDocument.id] ?? 1),
        Math.max(1, activeOrganizationPlan?.pages.length ?? activeDocument.pageCount),
      )
    : 0;
  const selectedOrganizedPageId = activeDocument
    ? (selectedPageIdsByDocument[activeDocument.id] ?? null)
    : null;
  const activeDocumentEditingState = activeDocument
    ? getDocumentEditingState(pdfEditsByDocument, activeDocument.id)
    : null;
  const activePdfEdits = activeDocumentEditingState?.edits ?? [];
  const isActiveDocumentDirty = activeDocumentEditingState?.isDirty ?? false;
  const dirtyDocumentIds = useMemo(
    () =>
      new Set(
        Object.entries(pdfEditsByDocument).flatMap(
          ([documentId, editingState]) =>
            editingState.isDirty ? [documentId] : [],
        ),
      ),
    [pdfEditsByDocument],
  );
  useEffect(() => {
    const referencedFonts = Object.values(pdfEditsByDocument).flatMap((state) =>
      state.edits.flatMap((edit) =>
        (edit.type === "add_text" || edit.type === "native_text") && edit.style.fontRef
          ? [edit.style.fontRef]
          : [],
      ),
    );
    fontRegistry.setProtectedFontRefs(referencedFonts);
    [...new Set(referencedFonts)]
      .filter((fontRef) => !fontRef.startsWith("pdf-standard:") && !fontRef.startsWith("document:"))
      .forEach((fontRef) => {
        void fontRegistry.ensureLoaded(fontRef).catch(() => {
          setStorageWarning(
            `La police ${fontRef} référencée par un document est indisponible. Choisissez une police de remplacement.`,
          );
        });
      });
  }, [pdfEditsByDocument]);
  const pendingCloseDocument = pendingCloseDocumentId
    ? documents.find((document) => document.id === pendingCloseDocumentId) ?? null
    : null;
  const saveAsDocument = saveAsDocumentId
    ? documents.find((document) => document.id === saveAsDocumentId) ?? null
    : null;
  const selectedTextEdit =
    activePdfEdits.find(
      (edit): edit is AddTextEdit =>
        edit.id === selectedEditId && edit.type === "add_text",
    ) ?? null;
  const selectedNativeTextEdit =
    activePdfEdits.find(
      (edit): edit is NativeTextEdit =>
        edit.id === selectedEditId && edit.type === "native_text",
    ) ?? null;
  const selectedShapeEdit =
    activePdfEdits.find(
      (edit): edit is ShapeEdit =>
        edit.id === selectedEditId && edit.type === "shape",
    ) ?? null;
  const selectedFreehandEdit = activePdfEdits.find((edit): edit is FreehandEdit => edit.id === selectedEditId && edit.type === "freehand") ?? null;
  const freehandInspectorEdit = selectedFreehandEdit ?? (
    activeEditingTool === "freehand"
      ? {
          id: "freehand-tool-style",
          type: "freehand" as const,
          page: activePageNumber || 1,
          rect: { x0: 0, y0: 0, x1: 0, y1: 0 },
          points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          style: freehandToolStyle,
        }
      : null
  );
  const selectedTextMarkupEdit = activePdfEdits.find((edit): edit is TextMarkupEdit => edit.id === selectedEditId && edit.type === "text_markup") ?? null;
  const selectedCommentEdit = activePdfEdits.find((edit): edit is PdfCommentEdit => edit.id === selectedEditId && edit.type === "comment") ?? null;
  const selectedPdfEdit =
    activePdfEdits.find((edit) => edit.id === selectedEditId) ?? null;
  const pendingSignatureImage = pendingSignatureImageId
    ? (signatureImages[pendingSignatureImageId] ?? null)
    : null;
  const activeComments = activePdfEdits.filter((edit): edit is PdfCommentEdit => edit.type === "comment");
  const hasPendingOrganizationChanges =
    activeDocument !== null &&
    activeOrganizationPlan !== null &&
    (isPlanModified(activeOrganizationPlan, activeDocument.pageCount) ||
      activePdfEdits.length > 0);

  useEffect(() => {
    setOutputName(
      activeDocument
        ? getSuggestedPdfSaveName(
            activeDocument.fileName,
            activeDocument.workingSaveName,
          )
        : "",
    );
    setSaveToOutputDir(false);
  }, [activeDocumentId, activeDocument]);

  useEffect(() => {
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("select");
    setPendingSignatureImageId(null);
    setIsFileMenuOpen(false);
  }, [activeDocumentId]);

  useEffect(() => {
    if (
      selectedEditId &&
      !activePdfEdits.some((edit) => edit.id === selectedEditId)
    ) {
      setSelectedEditId(null);
      setEyedropperTarget(null);
    }
  }, [activePdfEdits, selectedEditId]);

  useEffect(() => {
    if (documents.length === 0) {
      setWorkspaceMode("read");
      setViewerMode((currentMode) => currentMode === "presentation" ? "continuous" : currentMode);
    }
  }, [documents.length]);

  useEffect(() => {
    if (workspaceMode !== "read") {
      setActiveEditingTool("select");
      setSelectedEditId(null);
      setPendingSignatureImageId(null);
    }
  }, [workspaceMode]);

  useEffect(() => {
    if (viewerMode !== "presentation") {
      return;
    }

    setWorkspaceMode("read");
    setActiveEditingTool("select");
    setSelectedEditId(null);
    setPendingSignatureImageId(null);
    setEyedropperTarget(null);
  }, [viewerMode]);

  useEffect(() => {
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;

    const requestPresentationFitRefresh = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setPresentationFitRefreshToken((currentToken) => currentToken + 1);
        });
      });
    };

    function handleFullscreenChange() {
      if (viewerMode !== "presentation") {
        return;
      }

      if (document.fullscreenElement === presentationContainerRef.current) {
        // Firefox can dispatch fullscreenchange before the fullscreen layout has
        // settled. Two frames ensure the measured viewer bounds are final.
        requestPresentationFitRefresh();
        return;
      }

      if (!document.fullscreenElement) {
        setViewerMode("single-page");
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [viewerMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (pendingFocusTargetRef.current === null) {
      return;
    }

    const pendingFocusTarget = pendingFocusTargetRef.current;

    if (pendingFocusTarget === "viewer") {
      setViewerFocusRequest((currentRequest) => currentRequest + 1);
    } else if (pendingFocusTarget === "file-input") {
      openFileInputRef.current?.focus();
    } else {
      documentButtonRefs.current.get(pendingFocusTarget)?.focus();
    }

    pendingFocusTargetRef.current = null;
  }, [activeDocumentId, documents, isSidebarVisible]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    if (dirtyDocumentIds.size === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyDocumentIds]);

  useEffect(() => {
    return () => {
      documentsRef.current.forEach(releasePdfDocument);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function restoreDocuments() {
      try {
        const storedIds = storedPreferences?.documentOrder ?? [];

        if (storedIds.length === 0) {
          if (!isCancelled) {
            setIsRestoringDocuments(false);
          }

          return;
        }

        setStatus("Restauration des documents enregistrés...");

        const restoredDocuments: OpenPdfDocument[] = [];
        let failedCount = 0;
        const storedDocuments = await loadStoredDocuments(storedIds);
        failedCount += Math.max(0, storedIds.length - storedDocuments.length);

        for (const storedDocument of storedDocuments) {
          try {
            restoredDocuments.push(await restoreOpenDocument(storedDocument));
          } catch {
            failedCount += 1;
          }
        }

        if (isCancelled) {
          restoredDocuments.forEach(releasePdfDocument);
          return;
        }

        const restoredPlans: Record<string, OrganizePagePlan> = {};
        const restoredSelectedPageIds: Record<string, string | null> = {};
        let invalidPlanCount = 0;
        const restoredSourceDocuments = Object.fromEntries(
          restoredDocuments.map((document) => [
            document.id,
            { fileName: document.fileName, pageCount: document.pageCount },
          ]),
        );

        restoredDocuments.forEach((restoredDocument) => {
          const storedPlan = loadOrganizationPlan(restoredDocument.id);

          if (!storedPlan) {
            return;
          }

          const hydratedPlan = hydratePlanSourceNames(storedPlan.plan, restoredSourceDocuments);

          if (!isValidPagePlanForDocument(hydratedPlan, restoredDocument.id, restoredSourceDocuments)) {
            removeOrganizationPlan(restoredDocument.id);
            invalidPlanCount += 1;
            return;
          }

          restoredPlans[restoredDocument.id] = hydratedPlan;
          restoredSelectedPageIds[restoredDocument.id] = hydratedPlan.pages.some(
            (page) => page.id === storedPlan.selectedPageId,
          )
            ? storedPlan.selectedPageId
            : null;
        });

        setDocuments(restoredDocuments);
        storedDocuments.forEach((storedDocument) => {
          if (storedDocument.nativeTextEdits?.length) {
            dispatchPdfEdits({ type: "hydrate", documentId: storedDocument.id, edits: storedDocument.nativeTextEdits });
          }
        });
        setOrganizationPlans(restoredPlans);
        setSelectedPageIdsByDocument(restoredSelectedPageIds);
        setActiveDocumentId(
          storedPreferences?.activeDocumentId &&
            restoredDocuments.some((document) => document.id === storedPreferences.activeDocumentId)
            ? storedPreferences.activeDocumentId
            : restoredDocuments[restoredDocuments.length - 1]?.id ?? null,
        );
        if (restoredDocuments.length > 0) {
          pendingFocusTargetRef.current = "viewer";
        }
        const restorationMessages: string[] = [];
        if (failedCount > 0) {
          restorationMessages.push(
            failedCount === 1
              ? "1 document n'a pas pu être restauré."
              : `${failedCount} documents n'ont pas pu être restaurés.`,
          );
        }
        if (invalidPlanCount > 0) {
          restorationMessages.push(
            invalidPlanCount === 1
              ? "1 plan d'organisation a été réinitialisé car une source est indisponible ou invalide."
              : `${invalidPlanCount} plans d'organisation ont été réinitialisés car une source est indisponible ou invalide.`,
          );
        }
        setStatus(restorationMessages.join(" "));
        setRestorationError(null);
        setIsRestoringDocuments(false);
      } catch (error) {
        if (!isCancelled) {
          setRestorationError(
            error instanceof Error
              ? error.message
              : "La restauration des documents a échoué.",
          );
          setIsRestoringDocuments(false);
        }
      }
    }

    void restoreDocuments();

    return () => {
      isCancelled = true;
    };
  }, [restorationAttempt, storedPreferences]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const preferencesSaved = saveViewerPreferences({
      theme,
      sidebarVisible: isSidebarVisible,
      activeDocumentId,
      documentOrder: documents.map((document) => document.id),
      ...(lastCommentAuthor ? { commentAuthor: lastCommentAuthor } : {}),
      viewerMode: viewerMode === "presentation" ? "single-page" : viewerMode,
    });

    if (!preferencesSaved) {
      setStorageWarning("Les préférences locales n'ont pas pu être enregistrées. Vérifiez l'espace de stockage du navigateur.");
    }
  }, [activeDocumentId, documents, isRestoringDocuments, isSidebarVisible, lastCommentAuthor, theme, viewerMode]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      if (documents.length === 0) {
        void clearStoredDocuments();
        return;
      }

      void Promise.all(documents.map((document) => saveStoredDocument(buildViewerSnapshot(
        document,
        getDocumentEditingState(pdfEditsByDocument, document.id).edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text"),
      )))).then((results) => {
        if (results.some((saved) => !saved)) {
          setStorageWarning(
            "Les PDF ne peuvent pas être conservés durablement dans ce navigateur. Ils resteront ouverts jusqu'à la fermeture de l'onglet.",
          );
        }
      });
    }, 250);

    return () => {
      window.clearTimeout(saveTimeout);
    };
  }, [documents, isRestoringDocuments, pdfEditsByDocument]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const plansSaved = Object.entries(organizationPlans).flatMap(([documentId, plan]) => {
      if (!documents.some((document) => document.id === documentId)) {
        return [];
      }

      return [
        saveOrganizationPlan(documentId, {
          plan,
          selectedPageId: selectedPageIdsByDocument[documentId] ?? null,
        }),
      ];
    });

    if (plansSaved.some((saved) => !saved)) {
      setStorageWarning("Le plan d'organisation n'a pas pu être enregistré localement. Vérifiez l'espace de stockage du navigateur.");
    }
  }, [documents, isRestoringDocuments, organizationPlans, selectedPageIdsByDocument]);

  const updateDocumentZoom = useCallback((documentId: string, delta: number) => {
    setFitToPageByDocument((currentModes) => ({ ...currentModes, [documentId]: false }));
    setDocuments((currentDocuments) =>
      currentDocuments.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        const nextZoom = clampZoom(document.zoom + delta);
        return nextZoom === document.zoom ? document : { ...document, zoom: nextZoom };
      }),
    );
  }, []);

  const setDocumentZoom = useCallback((documentId: string, zoom: number) => {
    const nextZoom = clampZoom(zoom);
    setDocuments((currentDocuments) => {
      let changed = false;
      const nextDocuments = currentDocuments.map((document) => {
        if (document.id !== documentId || Math.abs(document.zoom - nextZoom) <= 0.001) {
          return document;
        }
        changed = true;
        return { ...document, zoom: nextZoom };
      });
      return changed ? nextDocuments : currentDocuments;
    });
  }, []);

  const recordActivePage = useCallback(
    (documentId: string, pageNumber: number) => {
      activePageByDocumentRef.current[documentId] = pageNumber;
      setActivePageByDocument((currentPages) =>
        currentPages[documentId] === pageNumber
          ? currentPages
          : { ...currentPages, [documentId]: pageNumber },
      );
    },
    [],
  );

  const goToActivePage = useCallback((pageNumber: number) => {
    if (!activeDocument) return;
    const pageCount = activeOrganizationPlan?.pages.length ?? activeDocument.pageCount;
    recordActivePage(activeDocument.id, Math.min(pageCount, Math.max(1, pageNumber)));
  }, [activeDocument, activeOrganizationPlan, recordActivePage]);

  const changeViewerMode = useCallback((nextMode: ViewerMode) => {
    if (!activeDocument || nextMode === viewerMode) return;

    if (nextMode !== "continuous") {
      setFitToPageByDocument((currentModes) => ({ ...currentModes, [activeDocument.id]: true }));
    }

    if (nextMode === "presentation") {
      const container = presentationContainerRef.current;
      if (container && document.fullscreenEnabled && container.requestFullscreen) {
        void container.requestFullscreen().catch((error: unknown) => {
          console.info("Le plein écran natif est indisponible ; présentation applicative conservée.", error);
        });
      }
    }

    setViewerMode(nextMode);
  }, [activeDocument, viewerMode]);

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
    setViewerMode("single-page");
  }, []);

  useEffect(() => {
    function handleViewerNavigation(event: globalThis.KeyboardEvent) {
      if (
        viewerMode === "continuous" ||
        !activeDocument ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      if (event.key === "Escape" && viewerMode === "presentation") {
        event.preventDefault();
        exitPresentation();
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          goToActivePage(activePageNumber + 1);
          break;
        case " ":
          if (viewerMode === "presentation") {
            event.preventDefault();
            goToActivePage(activePageNumber + 1);
          }
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goToActivePage(activePageNumber - 1);
          break;
        case "Home":
          event.preventDefault();
          goToActivePage(1);
          break;
        case "End":
          event.preventDefault();
          goToActivePage(activeOrganizationPlan?.pages.length ?? activeDocument.pageCount);
          break;
      }
    }

    window.addEventListener("keydown", handleViewerNavigation);
    return () => window.removeEventListener("keydown", handleViewerNavigation);
  }, [activeDocument, activeOrganizationPlan, activePageNumber, exitPresentation, goToActivePage, viewerMode]);

  const updateDocumentScrollPosition = useCallback(
    (documentId: string, scrollLeft: number, scrollTop: number) => {
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) => {
          if (
            document.id !== documentId ||
            (document.scrollLeft === scrollLeft && document.scrollTop === scrollTop)
          ) {
            return document;
          }

          return { ...document, scrollLeft, scrollTop };
        }),
      );
    },
    [],
  );

  const addTextEdit = useCallback(
    (pageNumber: number, rect: PdfRect) => {
      if (!activeDocument) {
        return;
      }

      const edit: AddTextEdit = {
        id: `text-${Date.now()}-${nextTextEditId.current++}`,
        type: "add_text",
        page: pageNumber,
        rect,
        text: "",
        style: {
          ...DEFAULT_TEXT_STYLE,
          fontSize: Math.min(144, Math.max(6, Math.round((rect.y1 - rect.y0) * 0.48))),
        },
        autoSize: true,
      };

      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const addNativeTextEdit = useCallback(
    (span: NativeTextSpan, text: string) => {
      if (!activeDocument || text === span.sourceText) return;
      const sourceFontName = normalizeSubsetFontName(span.sourceFontName ?? "Police du document");
      const standardFamily = /^(Helvetica|Arial)/i.test(sourceFontName)
        ? "Helvetica"
        : /^Times/i.test(sourceFontName)
          ? "Times"
          : /^Courier/i.test(sourceFontName)
            ? "Courier"
            : null;
      const fontRef = standardFamily
        ? `pdf-standard:${standardFamily.toLowerCase()}:400:normal`
        : span.sourceFontResourceId
          ? `document:${span.sourceFontResourceId}`
          : "bundled:noto-sans:400:normal";
      const edit: NativeTextEdit = {
        id: `native-text-${Date.now()}-${nextNativeTextEditId.current++}`,
        type: "native_text",
        page: span.page,
        rect: span.rect,
        source: {
          sourceId: span.sourceId,
          sourceText: span.sourceText,
          sourceBBox: span.sourceBBox,
          sourceOrigin: span.sourceOrigin,
          sourceFontName: span.sourceFontName,
          sourceFontResourceId: span.sourceFontResourceId,
          sourceFontSize: span.sourceFontSize,
          sourceColor: span.sourceColor,
          sourceRotation: span.sourceRotation,
          sourceFingerprint: span.sourceFingerprint,
          editable: span.editable,
          limitation: span.limitation,
          limitationMessage: span.limitationMessage,
        },
        text,
        style: {
          fontFamily: standardFamily ?? (span.sourceFontResourceId ? sourceFontName : "Noto Sans"),
          fontRef,
          fontSize: span.sourceFontSize,
          color: span.sourceColor,
          bold: span.fontWeight >= 700,
          fontStyle: span.fontStyle,
        },
        ...(!standardFamily && !span.sourceFontResourceId
          ? { fontFallbackReason: "La police source ne peut pas être réutilisée. Noto Sans est proposée explicitement comme fallback exportable." }
          : {}),
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const addShapeEdit = useCallback(
    (pageNumber: number, shapeType: ShapeType, rect: PdfRect) => {
      if (!activeDocument) {
        return;
      }
      const edit: ShapeEdit = {
        id: `shape-${Date.now()}-${nextShapeEditId.current++}`,
        type: "shape",
        shapeType,
        page: pageNumber,
        rect,
        style: { ...DEFAULT_SHAPE_STYLE },
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setEyedropperTarget(null);
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const addFreehandEdit = useCallback((pageNumber: number, points: import("./editing/types").PdfPoint[]) => {
    if (!activeDocument || points.length < 2) return;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const edit: FreehandEdit = { id: `freehand-${Date.now()}-${nextFreehandEditId.current++}`, type: "freehand", page: pageNumber, points, rect: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 0.1, y1: Math.max(...ys) + 0.1 }, style: { ...freehandToolStyle } };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument, freehandToolStyle]);

  const addTextMarkupEdit = useCallback((kind: TextMarkupKind, color: string) => {
    if (!activeDocument || !textMarkupSelection) return;
    const { page, rects } = textMarkupSelection;
    const edit: TextMarkupEdit = { id: `markup-${Date.now()}-${nextTextMarkupEditId.current++}`, type: "text_markup", kind, page, rects, color, rect: { x0: Math.min(...rects.map((rect) => rect.x0)), y0: Math.min(...rects.map((rect) => rect.y0)), x1: Math.max(...rects.map((rect) => rect.x1)), y1: Math.max(...rects.map((rect) => rect.y1)) } };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setTextMarkupSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [activeDocument, textMarkupSelection]);

  const startComment = useCallback((page: number, point: import("./editing/types").PdfPoint) => {
    if (!activeDocument) return;
    setPendingComment({ page, point });
    setCommentDraft("");
    setCommentAuthorDraft(lastCommentAuthor);
  }, [activeDocument, lastCommentAuthor]);

  const addComment = useCallback(() => {
    if (!activeDocument || !pendingComment || !commentDraft.trim()) return;
    const now = new Date().toISOString();
    const edit: PdfCommentEdit = {
      id: `comment-${Date.now()}-${nextCommentEditId.current++}`,
      type: "comment",
      commentType: "text",
      page: pendingComment.page,
      rect: { x0: pendingComment.point.x, y0: pendingComment.point.y, x1: pendingComment.point.x + 18, y1: pendingComment.point.y + 18 },
      content: commentDraft.trim(), author: commentAuthorDraft.trim() || undefined, createdAt: now, modifiedAt: now, source: "local",
    };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setPendingComment(null);
    setCommentDraft("");
    if (commentAuthorDraft.trim()) setLastCommentAuthor(commentAuthorDraft.trim());
    setActiveEditingTool("select");
  }, [activeDocument, commentAuthorDraft, commentDraft, pendingComment]);

  useEffect(() => {
    const handleSelection = (event: Event) => setTextMarkupSelection((event as CustomEvent<{ page: number; rects: PdfRect[]; top: number; left: number }>).detail);
    const close = () => setTextMarkupSelection(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pdf-text-markup-selection", handleSelection);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pdf-text-markup-selection", handleSelection);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setTextMarkupSelection(null);
  }, [activeDocumentId, activeEditingTool]);

  useEffect(() => {
    if (!textMarkupSelection) return;
    const closeOnOutsidePointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && textMarkupToolbarRef.current?.contains(event.target)) return;
      setTextMarkupSelection(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [textMarkupSelection]);

  const updatePdfEdit = useCallback(
    (edit: PdfEdit, coalesceKey?: string) => {
      if (!activeDocument) {
        return;
      }
      dispatchPdfEdits({ type: "replace", documentId: activeDocument.id, edit, coalesceKey });
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const finishPdfEditCoalescing = useCallback(
    (editId: string, property: string) => {
      if (!activeDocument) {
        return;
      }
      dispatchPdfEdits({
        type: "finish_coalescing",
        documentId: activeDocument.id,
        coalesceKey: `${editId}:${property}`,
      });
    },
    [activeDocument],
  );

  const deletePdfEdit = useCallback(
    (editId: string) => {
      if (!activeDocument) {
        return;
      }
      const edit = getDocumentEditingState(pdfEditsByDocument, activeDocument.id).edits.find((candidate) => candidate.id === editId);
      if (edit?.type === "comment" && edit.source === "pdf") {
        return;
      }
      dispatchPdfEdits({
        type: "delete",
        documentId: activeDocument.id,
        editId,
      });
      setSelectedEditId((currentId) => (currentId === editId ? null : currentId));
      setExportFeedback(null);
    },
    [activeDocument, pdfEditsByDocument],
  );

  const undoPdfEdit = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    dispatchPdfEdits({ type: "undo", documentId: activeDocument.id });
    setExportFeedback(null);
  }, [activeDocument]);

  const redoPdfEdit = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    dispatchPdfEdits({ type: "redo", documentId: activeDocument.id });
    setExportFeedback(null);
  }, [activeDocument]);

  const copySelectedPdfEdit = useCallback(() => {
    if (!selectedPdfEdit) {
      return;
    }
    clipboardEditRef.current = clonePdfEdit(selectedPdfEdit);
    pasteSequenceRef.current = 0;
  }, [selectedPdfEdit]);

  const pastePdfEdit = useCallback(async () => {
    const sourceEdit = clipboardEditRef.current;
    const targetDocument = activeDocument;
    if (!sourceEdit || !targetDocument) {
      return;
    }

    const pageNumber = Math.min(
      targetDocument.pageCount,
      Math.max(1, activePageByDocumentRef.current[targetDocument.id] ?? 1),
    );
    const page = await targetDocument.pdfDocument.getPage(pageNumber);
    if (documentsRef.current.every((document) => document.id !== targetDocument.id)) {
      return;
    }

    pasteSequenceRef.current += 1;
    const offset = pasteSequenceRef.current * 12;
    const rect = offsetPdfRectWithinPage(sourceEdit.rect, page.view, {
      x: offset,
      y: offset,
    });
    let edit: PdfEdit;
    if (sourceEdit.type === "add_text") {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `text-${Date.now()}-${nextTextEditId.current++}`,
        page: pageNumber,
        rect,
      } as AddTextEdit;
    } else if (sourceEdit.type === "shape") {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `shape-${Date.now()}-${nextShapeEditId.current++}`,
        page: pageNumber,
        rect,
      } as ShapeEdit;
    } else {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `signature-${Date.now()}-${nextSignatureEditId.current++}`,
        page: pageNumber,
        rect,
      } as SignatureEdit;
    }

    dispatchPdfEdits({ type: "add", documentId: targetDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument]);

  const applySampledShapeColor = useCallback(
    (color: string) => {
      if (!selectedShapeEdit || !eyedropperTarget) {
        return;
      }
      updatePdfEdit({
        ...selectedShapeEdit,
        style: {
          ...selectedShapeEdit.style,
          ...(eyedropperTarget === "stroke"
            ? { strokeColor: color }
            : { fillColor: color }),
        },
      });
      setEyedropperTarget(null);
    },
    [eyedropperTarget, selectedShapeEdit, updatePdfEdit],
  );

  useEffect(() => {
    function handleSelectedEditDeletion(event: globalThis.KeyboardEvent) {
      if (
        !selectedEditId ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest(".viewer")) {
        return;
      }
      event.preventDefault();
      deletePdfEdit(selectedEditId);
    }

    window.addEventListener("keydown", handleSelectedEditDeletion);
    return () => window.removeEventListener("keydown", handleSelectedEditDeletion);
  }, [deletePdfEdit, selectedEditId]);

  useEffect(() => {
    function handleEditingShortcuts(event: globalThis.KeyboardEvent) {
      if (
        !activeDocument ||
        workspaceMode !== "read" ||
        isEditableKeyboardTarget(event.target) ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoPdfEdit();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        undoPdfEdit();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoPdfEdit();
        return;
      }
      if (key === "c" && selectedPdfEdit) {
        event.preventDefault();
        copySelectedPdfEdit();
        return;
      }
      if (key === "v" && clipboardEditRef.current) {
        event.preventDefault();
        void pastePdfEdit();
      }
    }

    window.addEventListener("keydown", handleEditingShortcuts);
    return () => window.removeEventListener("keydown", handleEditingShortcuts);
  }, [
    activeDocument,
    copySelectedPdfEdit,
    pastePdfEdit,
    redoPdfEdit,
    selectedPdfEdit,
    undoPdfEdit,
    workspaceMode,
  ]);

  const prepareSignatureImage = useCallback((draft: SignatureImageDraft) => {
    const image: SignatureImage = {
      ...draft,
      id: `signature-image-${Date.now()}-${nextSignatureImageId.current++}`,
    };
    setSignatureImages((currentImages) => ({
      ...currentImages,
      [image.id]: image,
    }));
    setPendingSignatureImageId(image.id);
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("signature");
    setIsSignatureDialogOpen(false);
    setExportFeedback(null);
  }, []);

  const placeSignature = useCallback(
    (pageNumber: number, rect: PdfRect) => {
      if (!activeDocument || !pendingSignatureImageId) {
        return;
      }
      const edit: SignatureEdit = {
        id: `signature-${Date.now()}-${nextSignatureEditId.current++}`,
        type: "signature",
        page: pageNumber,
        rect,
        imageId: pendingSignatureImageId,
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setPendingSignatureImageId(null);
      setActiveEditingTool("select");
      setExportFeedback(null);
    },
    [activeDocument, pendingSignatureImageId],
  );

  const performCloseDocument = useCallback(
    (documentId: string) => {
      const closingIndex = documents.findIndex((document) => document.id === documentId);

      if (closingIndex < 0) {
        return;
      }

      const plansUsingDocument = Object.entries(organizationPlans).filter(
        ([planDocumentId, plan]) =>
          planDocumentId !== documentId &&
          plan.pages.some((page) => page.sourceDocumentId === documentId),
      );

      if (
        plansUsingDocument.length > 0 &&
        !window.confirm(
          "Ce document est utilisé dans le plan d'organisation. Le fermer retirera ses pages du document final.",
        )
      ) {
        return;
      }

      plansUsingDocument.forEach(([planDocumentId]) => {
        dispatchPdfEdits({ type: "mark_dirty", documentId: planDocumentId });
      });

      const closingDocument = documents[closingIndex];
      const nextDocuments = documents.filter((document) => document.id !== documentId);
      const fallbackIndex = Math.min(closingIndex, nextDocuments.length - 1);
      const fallbackDocument = fallbackIndex >= 0 ? nextDocuments[fallbackIndex] : null;
      pendingFocusTargetRef.current = fallbackDocument?.id ?? "file-input";

      setExportFeedback(null);
      setDocuments(nextDocuments);
      dispatchPdfEdits({ type: "remove_document", documentId });
      setSelectedEditId(null);
      setActiveEditingTool("select");
      setPendingSignatureImageId(null);
      setOrganizationPlans((currentPlans) => {
        return Object.fromEntries(
          Object.entries(currentPlans).flatMap(([planDocumentId, plan]) => {
            if (planDocumentId === documentId) {
              return [];
            }

            return [[
              planDocumentId,
              {
                ...plan,
                pages: renumberOrganizedPages(
                  plan.pages.filter((page) => page.sourceDocumentId !== documentId),
                ),
              },
            ]];
          }),
        );
      });
      setSelectedPageIdsByDocument((currentSelection) => {
        return Object.fromEntries(
          Object.entries(currentSelection).flatMap(([planDocumentId, selectedPageId]) => {
            if (planDocumentId === documentId) {
              return [];
            }

            const plan = organizationPlans[planDocumentId];
            const selectedPage = plan?.pages.find((page) => page.id === selectedPageId);
            return [[
              planDocumentId,
              selectedPage?.sourceDocumentId === documentId ? null : selectedPageId,
            ]];
          }),
        );
      });
      removeOrganizationPlan(documentId);
      setActiveDocumentId((currentActiveId) => {
        if (currentActiveId !== documentId) {
          return nextDocuments.some((document) => document.id === currentActiveId)
            ? currentActiveId
            : (fallbackDocument?.id ?? null);
        }

        return fallbackDocument?.id ?? null;
      });
      setStatus(nextDocuments.length > 0 ? "" : "Sélectionnez un PDF local.");
      releasePdfDocument(closingDocument);
      if (nextDocuments.length === 0) {
        void clearStoredDocuments();
      } else {
        void removeStoredDocument(documentId);
      }
    },
    [documents, organizationPlans],
  );

  const closeDocument = useCallback(
    (documentId: string) => {
      if (getDocumentEditingState(pdfEditsByDocument, documentId).isDirty) {
        setPendingCloseDocumentId(documentId);
        setCloseAfterSaveDocumentId(null);
        return;
      }

      performCloseDocument(documentId);
    },
    [pdfEditsByDocument, performCloseDocument],
  );

  const selectDocumentByKeyboard = useCallback(
    (nextIndex: number) => {
      const nextDocument = documents[nextIndex];

      if (!nextDocument) {
        return;
      }

      pendingFocusTargetRef.current = nextDocument.id;
      setActiveDocumentId(nextDocument.id);
    },
    [documents],
  );

  const activateFocusedDocument = useCallback(
    (documentId: string | null) => {
      if (!documentId) {
        return;
      }

      if (documents.some((document) => document.id === documentId)) {
        pendingFocusTargetRef.current = documentId;
        setActiveDocumentId(documentId);
      }
    },
    [documents],
  );

  const closeActiveDocumentByKeyboard = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    closeDocument(activeDocument.id);
  }, [activeDocument, closeDocument]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);

  const selectDocumentFromSidebar = useCallback((documentId: string) => {
    pendingFocusTargetRef.current = "viewer";
    setActiveDocumentId(documentId);
  }, []);

  const clearLocalData = useCallback(() => {
    if (!window.confirm("Effacer toutes les données locales de ce viewer ?")) {
      return;
    }

    pendingFocusTargetRef.current = "file-input";
    setDocuments((currentDocuments) => {
      currentDocuments.forEach(releasePdfDocument);
      return [];
    });
    setActiveDocumentId(null);
    setOrganizationPlans({});
    setSelectedPageIdsByDocument({});
    activePageByDocumentRef.current = {};
    setActivePageByDocument({});
    setPageNavigationRequest(null);
    dispatchPdfEdits({ type: "clear" });
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("select");
    setSignatureImages({});
    setPendingSignatureImageId(null);
    setIsSignatureDialogOpen(false);
    setIsFileMenuOpen(false);
    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(null);
    setOutputName("");
    setSaveToOutputDir(false);
    setIsExporting(false);
    setExportFeedback(null);
    setIsOcrDialogOpen(false);
    setIsOcrProcessing(false);
    setIsConversionDialogOpen(false);
    setIsConverting(false);
    setStorageWarning(null);
    setWorkspaceMode("read");
    setStatus("Sélectionnez un PDF local.");
    setIsSidebarVisible(true);
    setIsRestoringDocuments(false);
    setTheme(getSystemTheme());
    nextDocumentId.current = 1;
    nextTextEditId.current = 1;
    nextShapeEditId.current = 1;
    nextSignatureImageId.current = 1;
    nextSignatureEditId.current = 1;
    documentButtonRefs.current.clear();
    void clearViewerStorage().then((cleared) => {
      if (!cleared) {
        setStorageWarning("Certaines données locales n'ont pas pu être effacées. Fermez puis rouvrez l'application avant de réessayer.");
      }
    });
  }, []);

  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const targetElement = event.target instanceof HTMLElement ? event.target : null;

      if (targetElement !== event.currentTarget && targetElement?.closest(".document-list") === null) {
        return;
      }

      if (documents.length === 0) {
        return;
      }

      const targetDocumentId = getSidebarDocumentId(event.target);
      const focusedDocumentIndex =
        targetDocumentId === null ? -1 : documents.findIndex((document) => document.id === targetDocumentId);

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (targetDocumentId !== null) {
          closeDocument(targetDocumentId);
        } else {
          closeActiveDocumentByKeyboard();
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        if (targetDocumentId !== null && targetElement?.classList.contains("document-select")) {
          event.preventDefault();
          activateFocusedDocument(targetDocumentId);
        }

        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        return;
      }

      let nextIndex = -1;

      switch (event.key) {
        case "ArrowUp":
          nextIndex = Math.max((focusedDocumentIndex >= 0 ? focusedDocumentIndex : activeDocumentIndex) - 1, 0);
          break;
        case "ArrowDown":
          nextIndex = Math.min(
            (focusedDocumentIndex >= 0 ? focusedDocumentIndex : activeDocumentIndex) + 1,
            documents.length - 1,
          );
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = documents.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      selectDocumentByKeyboard(nextIndex);
    },
    [
      activeDocumentIndex,
      activateFocusedDocument,
      closeActiveDocumentByKeyboard,
      closeDocument,
      documents,
      selectDocumentByKeyboard,
    ],
  );

  const updateActiveOrganizationPlan = useCallback(
    (
      updatePlan: (plan: OrganizePagePlan) => OrganizePagePlan,
      marksDocumentDirty = true,
    ) => {
      if (!activeDocument) {
        return;
      }

      setExportFeedback(null);
      if (marksDocumentDirty) {
        dispatchPdfEdits({
          type: "mark_dirty",
          documentId: activeDocument.id,
        });
      }
      setOrganizationPlans((currentPlans) => {
        const currentPlan =
          currentPlans[activeDocument.id] ??
          createInitialPagePlan(activeDocument.id, activeDocument.fileName, activeDocument.pageCount);

        return {
          ...currentPlans,
          [activeDocument.id]: updatePlan(currentPlan),
        };
      });
    },
    [activeDocument],
  );

  const moveOrganizedPage = useCallback(
    (fromIndex: number, toIndex: number) => {
      updateActiveOrganizationPlan((plan) => {
        return { ...plan, pages: moveOrganizedPageByIndex(plan.pages, fromIndex, toIndex) };
      });
    },
    [updateActiveOrganizationPlan],
  );

  const toggleOrganizedPageSelection = useCallback(
    (pageId: string) => {
      if (!activeDocument) {
        return;
      }

      updateActiveOrganizationPlan((plan) => plan, false);
      setSelectedPageIdsByDocument((currentSelection) => ({
        ...currentSelection,
        [activeDocument.id]: currentSelection[activeDocument.id] === pageId ? null : pageId,
      }));
    },
    [activeDocument, updateActiveOrganizationPlan],
  );

  const deleteOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => ({
        ...plan,
        pages: renumberOrganizedPages(plan.pages.filter((page) => page.id !== pageId)),
      }));
      if (activeDocument) {
        setSelectedPageIdsByDocument((currentSelection) => ({
          ...currentSelection,
          [activeDocument.id]: currentSelection[activeDocument.id] === pageId ? null : currentSelection[activeDocument.id],
        }));
      }
    },
    [activeDocument, updateActiveOrganizationPlan],
  );

  const duplicateOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => {
        const currentIndex = plan.pages.findIndex((page) => page.id === pageId);

        if (currentIndex < 0) {
          return plan;
        }

        const pages = [...plan.pages];
        const pageToDuplicate = pages[currentIndex];
        pages.splice(currentIndex + 1, 0, {
          ...pageToDuplicate,
          id: `${pageToDuplicate.id}:copy:${Date.now()}-${nextOrganizedPageId.current}`,
        });
        nextOrganizedPageId.current += 1;
        return { ...plan, pages: renumberOrganizedPages(pages) };
      });
    },
    [updateActiveOrganizationPlan],
  );

  const rotateOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => ({
        ...plan,
        pages: plan.pages.map((page) =>
          page.id === pageId ? { ...page, rotation: rotatePage(page.rotation, 90) } : page,
        ),
      }));
    },
    [updateActiveOrganizationPlan],
  );

  const resetActiveOrganizationPlan = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    setExportFeedback(null);
    const currentPlan = organizationPlans[activeDocument.id];
    if (
      currentPlan &&
      isPlanModified(currentPlan, activeDocument.pageCount)
    ) {
      dispatchPdfEdits({
        type: "mark_dirty",
        documentId: activeDocument.id,
      });
    }
    setOrganizationPlans((currentPlans) => {
      const { [activeDocument.id]: _resetPlan, ...remainingPlans } = currentPlans;
      return remainingPlans;
    });
    setSelectedPageIdsByDocument((currentSelection) => {
      const { [activeDocument.id]: _resetSelection, ...remainingSelection } = currentSelection;
      return remainingSelection;
    });
    removeOrganizationPlan(activeDocument.id);
  }, [activeDocument, organizationPlans]);

  const loadOpenPdfDocument = useCallback(async (
    file: File,
    workingSaveName: string | null = null,
  ): Promise<OpenPdfDocument> => {
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjsLib.getDocument({ data });

    try {
      const pdfDocument = await loadingTask.promise;
      const documentId = `pdf-${Date.now()}-${nextDocumentId.current}`;

      nextDocumentId.current += 1;
      return {
        id: documentId,
        fileName: file.name,
        workingSaveName,
        file,
        pdfDocument,
        loadingTask,
        pageCount: pdfDocument.numPages,
        zoom: 1,
        scrollLeft: 0,
        scrollTop: 0,
        error: null,
      };
    } catch (error) {
      void loadingTask.destroy().catch(() => undefined);
      throw error;
    }
  }, []);

  const openGeneratedPdfDocument = useCallback(
    async (file: File, workingSaveName: string | null = null) => {
      const fileName = getUniqueFileName(
        file.name,
        documents.map((document) => document.fileName),
      );
      const uniqueFile =
        fileName === file.name
          ? file
          : new File([file], fileName, {
              type: file.type || "application/pdf",
            });
      const openedDocument = await loadOpenPdfDocument(
        uniqueFile,
        workingSaveName,
      );
      const usageWarnings = getDocumentUsageWarnings(
        uniqueFile,
        openedDocument.pageCount,
        documents.length + 1,
      );

      pendingFocusTargetRef.current = "viewer";
      setDocuments((currentDocuments) => [...currentDocuments, openedDocument]);
      setActiveDocumentId(openedDocument.id);
      setWorkspaceMode("read");
      if (!import.meta.env.MODE.startsWith("test")) void loadPdfComments(backendUrl, openedDocument.file).then((comments) => {
        if (comments.length) dispatchPdfEdits({ type: "hydrate", documentId: openedDocument.id, edits: comments });
      });

      return { openedDocument, usageWarnings };
    },
    [backendUrl, documents, loadOpenPdfDocument],
  );

  const addExternalPagesFromOpenDocument = useCallback(
    (sourceDocumentId: string, sourcePageIndexes: number[]) => {
      const sourceDocument = documents.find((document) => document.id === sourceDocumentId);

      if (!sourceDocument || sourcePageIndexes.length === 0) {
        setExportFeedback({
          kind: "error",
          message: "Le PDF source n'est plus disponible. Ouvrez-le à nouveau avant de l'ajouter.",
        });
        return;
      }

      setExportFeedback(null);
      updateActiveOrganizationPlan((plan) => {
        const addedPages = [...sourcePageIndexes]
          .sort((left, right) => left - right)
          .filter((sourcePageIndex) => sourcePageIndex >= 0 && sourcePageIndex < sourceDocument.pageCount)
          .map((sourcePageIndex) => ({
          id: `${sourceDocument.id}:page:${sourcePageIndex}:insert:${Date.now()}-${nextOrganizedPageId.current++}`,
          sourceDocumentId: sourceDocument.id,
          sourceDocumentName: sourceDocument.fileName,
          sourcePageIndex,
          displayPageNumber: 0,
          rotation: 0 as const,
          }));

        return { ...plan, pages: renumberOrganizedPages([...plan.pages, ...addedPages]) };
      });
    },
    [documents, updateActiveOrganizationPlan],
  );

  const generatePdfForDocument = useCallback(async (
    documentId: string,
    operation: "export" | "save_as",
    requestedOutputName?: string,
  ): Promise<boolean> => {
    const sourceDocument = documents.find(
      (document) => document.id === documentId,
    );
    if (!sourceDocument) {
      setExportFeedback({ kind: "error", message: "Le document à sauvegarder n'est plus ouvert." });
      return false;
    }
    const organizationPlan =
      organizationPlans[documentId] ??
      createInitialPagePlan(
        sourceDocument.id,
        sourceDocument.fileName,
        sourceDocument.pageCount,
      );
    if (organizationPlan.pages.length === 0) {
      setExportFeedback({ kind: "error", message: "Aucune page n'est disponible pour l'export." });
      return false;
    }

    const requiredDocumentIds = [...new Set(organizationPlan.pages.map((page) => page.sourceDocumentId))];
    const sourceFiles = requiredDocumentIds.map((documentId) =>
      documents.find((document) => document.id === documentId),
    );

    if (sourceFiles.some((document) => !document)) {
      setExportFeedback({
        kind: "error",
        message: "Un PDF source requis par le plan n'est plus disponible. Retirez ses pages ou réinitialisez le plan.",
      });
      return false;
    }

    const sourceDocumentInfo = Object.fromEntries(
      documents.map((document) => [
        document.id,
        { fileName: document.fileName, pageCount: document.pageCount },
      ]),
    );
    if (!isValidPagePlanForDocument(organizationPlan, sourceDocument.id, sourceDocumentInfo)) {
      setExportFeedback({
        kind: "error",
        message: "Le plan d'organisation est invalide. Réinitialisez-le avant d'exporter.",
      });
      return false;
    }

    const resolvedOutputName =
      operation === "save_as" && requestedOutputName
        ? requestedOutputName
        : operation === "export" && sourceDocument.id === activeDocumentId
          ? outputName.trim() ||
            getSuggestedPdfSaveName(
              sourceDocument.fileName,
              sourceDocument.workingSaveName,
            )
          : getSuggestedPdfSaveName(
              sourceDocument.fileName,
              sourceDocument.workingSaveName,
            );
    const formData = new FormData();
    sourceFiles.forEach((sourceDocument) => {
      if (sourceDocument) {
        formData.append("files", sourceDocument.file, sourceDocument.fileName);
      }
    });
    formData.append("documentIds", JSON.stringify(requiredDocumentIds));
    const exportedPagesByDocument = new Map<string, Set<number>>();
    organizationPlan.pages.forEach((page) => {
      const exportedPages =
        exportedPagesByDocument.get(page.sourceDocumentId) ?? new Set<number>();
      exportedPages.add(page.sourcePageIndex + 1);
      exportedPagesByDocument.set(page.sourceDocumentId, exportedPages);
    });
    const exportedPdfEdits = requiredDocumentIds.flatMap((documentId) =>
      getDocumentEditingState(pdfEditsByDocument, documentId).edits.flatMap((edit, order) => {
        const pageIsExported = exportedPagesByDocument
          .get(documentId)
          ?.has(edit.page);
        const editIsExportable =
          edit.type === "add_text"
            ? edit.text.length > 0
            : edit.type === "signature"
              ? signatureImages[edit.imageId] !== undefined
              : true;
        return pageIsExported && editIsExportable
          ? [{ ...edit, sourceDocumentId: documentId, order }]
          : [];
      }),
    );
    const exportedTextEdits = exportedPdfEdits.filter(
      (edit): edit is AddTextEdit & { sourceDocumentId: string; order: number } =>
        edit.type === "add_text",
    );
    const exportedNativeTextEdits = exportedPdfEdits.filter(
      (edit): edit is NativeTextEdit & { sourceDocumentId: string; order: number } =>
        edit.type === "native_text",
    );
    const exportedSignatureEdits = exportedPdfEdits.filter(
      (edit): edit is SignatureEdit & {
        sourceDocumentId: string;
        order: number;
      } => edit.type === "signature",
    );
    const exportedShapeEdits = exportedPdfEdits.filter(
      (edit): edit is ShapeEdit & {
        sourceDocumentId: string;
        order: number;
      } => edit.type === "shape",
    );
    const exportedFreehandEdits = exportedPdfEdits.filter(
      (edit): edit is FreehandEdit & { sourceDocumentId: string; order: number } => edit.type === "freehand",
    );
    const exportedTextMarkupEdits = exportedPdfEdits.filter(
      (edit): edit is TextMarkupEdit & { sourceDocumentId: string; order: number } => edit.type === "text_markup",
    );
    const exportedComments = exportedPdfEdits.filter(
      (edit): edit is PdfCommentEdit & { sourceDocumentId: string; order: number } => edit.type === "comment" && edit.source === "local",
    );
    const exportedSignatureImageIds = new Set(
      exportedSignatureEdits.map((edit) => edit.imageId),
    );
    const exportedSignatureImages = [...exportedSignatureImageIds].flatMap(
      (imageId) => {
        const image = signatureImages[imageId];
        return image ? [image] : [];
      },
    );
    const customFontRefs = [...new Set(
      [...exportedTextEdits, ...exportedNativeTextEdits]
        .map((edit) => edit.style.fontRef)
        .filter((fontRef): fontRef is string => Boolean(fontRef?.startsWith("custom:"))),
    )];
    setIsExporting(true);
    setExportFeedback(null);
    let exportedFontResources: Array<{ id: string; sha256: string; format: "ttf" | "otf"; fileName: string; dataUrl: string }> = [];
    try {
      if (customFontRefs.length > 0) {
        exportedFontResources = await Promise.all(customFontRefs.map(async (fontRef) => {
          const font = await getCustomFont(fontRef);
          if (!font) throw new Error(`La police personnalisée ${fontRef} n'est plus disponible. Remplacez-la avant l'export.`);
          return { id: font.id, sha256: font.sha256, format: font.format, fileName: font.originalFileName, dataUrl: await blobToDataUrl(font.binary) };
        }));
      }
    } catch (error) {
      setIsExporting(false);
      setExportFeedback({ kind: "error", message: error instanceof Error ? error.message : "Une police personnalisée est indisponible." });
      return false;
    }
    formData.append(
      "plan",
      JSON.stringify({
        outputName: resolvedOutputName,
        saveToOutputDir: operation === "export" ? saveToOutputDir : false,
        pages: organizationPlan.pages.map((page) => ({
          sourceDocumentId: page.sourceDocumentId,
          sourcePageIndex: page.sourcePageIndex,
          rotation: page.rotation,
        })),
        ...(exportedTextEdits.length > 0
          ? { edits: exportedTextEdits }
          : {}),
        ...(exportedNativeTextEdits.length > 0 ? { nativeTextEdits: exportedNativeTextEdits } : {}),
        ...(exportedFontResources.length > 0 ? { fontResources: exportedFontResources } : {}),
        ...(exportedSignatureEdits.length > 0
          ? {
              signatures: exportedSignatureEdits,
              signatureImages: exportedSignatureImages,
            }
          : {}),
        ...(exportedShapeEdits.length > 0
          ? { shapes: exportedShapeEdits }
          : {}),
        ...(exportedFreehandEdits.length > 0 ? { freehands: exportedFreehandEdits } : {}),
        ...(exportedTextMarkupEdits.length > 0 ? { textMarkups: exportedTextMarkupEdits } : {}),
        ...(exportedComments.length > 0 ? { comments: exportedComments } : {}),
      }),
    );

    try {
      const response = await fetch(`${backendUrl}/pdf/export/organize`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let detail = "Le PDF modifié n'a pas pu être exporté.";

        try {
          const errorBody = (await response.json()) as { detail?: string };
          detail = errorBody.detail ?? detail;
        } catch {
          // The backend may return an empty or non-JSON error response.
        }

        throw new Error(detail);
      }

      const pdfBlob = await response.blob();
      const downloadedName = getDownloadFileName(
        response.headers.get("content-disposition"),
        resolvedOutputName,
      );
      const outputWarning = response.headers.get("x-pdf-output-warning");
      const outputStatus = response.headers.get("x-pdf-output-status");
      const exportWarnings = parsePdfExportWarnings(
        response.headers.get("x-pdf-export-warnings"),
      );
      const textOverflowWarningCount = exportWarnings.filter(
        (warning) => warning.type === "text_overflow",
      ).length;
      const textOverflowMessage = textOverflowWarningCount
        ? ` ${textOverflowWarningCount} zone${textOverflowWarningCount > 1 ? "s" : ""} de texte dépassai${textOverflowWarningCount > 1 ? "ent" : "t"} de ${textOverflowWarningCount > 1 ? "leur" : "son"} cadre. ${textOverflowWarningCount > 1 ? "Leur export a" : "Son export a"} été réalisé en mode best effort.`
        : "";
      const exportedFile = downloadPdfToBrowser(pdfBlob, downloadedName);
      const operationLabel = operation === "export" ? "exporté" : "sauvegardé";
      const exportMessage = outputWarning
        ? `PDF ${operationLabel} avec succès : ${downloadedName}. ${outputWarning}`
        : outputStatus === "saved"
          ? `PDF ${operationLabel} avec succès : ${downloadedName}. Copie enregistrée dans data/output.`
          : `PDF ${operationLabel} avec succès : ${downloadedName}.`;

      try {
        const { usageWarnings: exportUsageWarnings } =
          await openGeneratedPdfDocument(
            exportedFile,
            operation === "export" ? null : downloadedName,
          );
        setExportFeedback({
          kind:
            outputWarning ||
            textOverflowWarningCount > 0 ||
            exportUsageWarnings.length > 0
              ? "warning"
              : "success",
          message: `${exportMessage}${textOverflowMessage} Ouvert dans l'application en mode lecture.${exportUsageWarnings
            .map((warning) => ` Avertissement: ${warning}`)
            .join("")}`,
        });
      } catch {
        setExportFeedback({
          kind: "warning",
          message: `${exportMessage}${textOverflowMessage} Le téléchargement est disponible, mais l'ouverture dans l'application a échoué.`,
        });
      }
      if (operation === "save_as") {
        dispatchPdfEdits({ type: "mark_saved", documentId });
      }
      return true;
    } catch (error) {
      const message =
        error instanceof TypeError
          ? "Backend indisponible ou erreur réseau. Vérifiez que le service PDF est démarré."
          : error instanceof Error
            ? `Erreur du backend : ${error.message}`
            : "Le PDF n'a pas pu être exporté.";
      setExportFeedback({ kind: "error", message });
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [activeDocumentId, backendUrl, documents, openGeneratedPdfDocument, organizationPlans, outputName, pdfEditsByDocument, saveToOutputDir, signatureImages]);

  const exportActiveOrganizationPlan = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    void generatePdfForDocument(activeDocument.id, "export");
  }, [activeDocument, generatePdfForDocument]);

  const openSaveAsDialog = useCallback(
    (documentId: string) => {
      if (isExporting || !documents.some((document) => document.id === documentId)) {
        return;
      }

      setExportFeedback(null);
      setIsFileMenuOpen(false);
      setSaveAsDocumentId(documentId);
    },
    [documents, isExporting],
  );

  const openActiveSaveAsDialog = useCallback(() => {
    if (!activeDocument || !isActiveDocumentDirty || isExporting) {
      return;
    }

    openSaveAsDialog(activeDocument.id);
  }, [activeDocument, isActiveDocumentDirty, isExporting, openSaveAsDialog]);

  const saveDocumentAs = useCallback(
    async (fileName: string) => {
      if (!saveAsDocumentId || isExporting) {
        return false;
      }

      const documentId = saveAsDocumentId;
      const didSave = await generatePdfForDocument(
        documentId,
        "save_as",
        fileName,
      );
      if (didSave) {
        setSaveAsDocumentId(null);
      }
      return didSave;
    },
    [generatePdfForDocument, isExporting, saveAsDocumentId],
  );

  const savePendingCloseDocument = useCallback(() => {
    if (!pendingCloseDocumentId || isExporting) {
      return;
    }

    const documentId = pendingCloseDocumentId;
    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(documentId);
    openSaveAsDialog(documentId);
  }, [isExporting, openSaveAsDialog, pendingCloseDocumentId]);

  const cancelSaveAsDialog = useCallback(() => {
    const documentId = saveAsDocumentId;
    setSaveAsDocumentId(null);

    if (documentId && closeAfterSaveDocumentId === documentId) {
      setCloseAfterSaveDocumentId(null);
      setPendingCloseDocumentId(documentId);
    }
  }, [closeAfterSaveDocumentId, saveAsDocumentId]);

  useEffect(() => {
    if (!closeAfterSaveDocumentId || isExporting) {
      return;
    }
    if (
      getDocumentEditingState(pdfEditsByDocument, closeAfterSaveDocumentId)
        .isDirty
    ) {
      return;
    }

    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(null);
    performCloseDocument(closeAfterSaveDocumentId);
  }, [
    closeAfterSaveDocumentId,
    isExporting,
    pdfEditsByDocument,
    performCloseDocument,
  ]);

  useEffect(() => {
    const handleApplicationShortcut = (event: globalThis.KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "s" &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey
      ) {
        event.preventDefault();
        openActiveSaveAsDialog();
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      if (saveAsDocumentId) {
        event.preventDefault();
        cancelSaveAsDialog();
        return;
      }

      const shouldHandleEscape =
        isFileMenuOpen ||
        isSignatureDialogOpen ||
        eyedropperTarget !== null ||
        activeEditingTool !== "select" ||
        pendingSignatureImageId !== null ||
        selectedEditId !== null;
      if (!shouldHandleEscape) {
        return;
      }

      event.preventDefault();
      setIsFileMenuOpen(false);
      setIsSignatureDialogOpen(false);
      setActiveEditingTool("select");
      setEyedropperTarget(null);
      setPendingSignatureImageId(null);
      setSelectedEditId(null);
    };

    window.addEventListener("keydown", handleApplicationShortcut);
    return () => window.removeEventListener("keydown", handleApplicationShortcut);
  }, [
    activeEditingTool,
    cancelSaveAsDialog,
    isFileMenuOpen,
    isSignatureDialogOpen,
    eyedropperTarget,
    openActiveSaveAsDialog,
    pendingSignatureImageId,
    saveAsDocumentId,
    selectedEditId,
  ]);

  const runOcrOnActiveDocument = useCallback(
    async (options: OcrOptions) => {
      if (!activeDocument || isOcrProcessing) {
        return;
      }

      const sourceDocument = activeDocument;
      const sourceFile = sourceDocument.file;

      setIsOcrDialogOpen(false);
      setIsOcrProcessing(true);
      setExportFeedback(null);

      try {
        const returnedFile = await requestOcrPdf(
          backendUrl,
          sourceFile,
          options,
        );
        let usageWarnings: string[];
        try {
          ({ usageWarnings } = await openGeneratedPdfDocument(returnedFile));
        } catch {
          throw new Error("Le serveur n'a pas produit un PDF valide.");
        }

        setExportFeedback({
          kind: usageWarnings.length > 0 ? "warning" : "success",
          message: `OCR terminé. Le document OCR a été ouvert.${usageWarnings
            .map((warning) => ` Avertissement: ${warning}`)
            .join("")}`,
        });
      } catch (error) {
        setExportFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Le traitement OCR a échoué.",
        });
      } finally {
        setIsOcrProcessing(false);
      }
    },
    [activeDocument, backendUrl, isOcrProcessing, openGeneratedPdfDocument],
  );

  const convertActiveDocument = useCallback(
    async (options: ConversionOptions) => {
      if (!activeDocument || isConverting) {
        return;
      }

      const sourceDocument = activeDocument;
      setIsConversionDialogOpen(false);
      setIsConverting(true);
      setExportFeedback(null);

      try {
        const conversion = await requestConversion(
          backendUrl,
          sourceDocument.file,
          options,
          sourceDocument.fileName,
        );
        downloadConversionFile(conversion.file);
        const pageSummary =
          conversion.metadata.pages.length > 0
            ? `${conversion.metadata.pages.length} page${conversion.metadata.pages.length > 1 ? "s" : ""}`
            : "pages demandées";
        const ocrSummary = conversion.metadata.ocrUsed
          ? " OCR automatique utilisé."
          : "";
        const warnings = conversion.metadata.warnings
          .map((warning) => ` Avertissement : ${warning}`)
          .join("");
        setExportFeedback({
          kind: warnings ? "warning" : "success",
          message: `Conversion réussie : ${conversion.file.name} (${pageSummary}).${ocrSummary}${warnings}`,
        });
      } catch (error) {
        setExportFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "La conversion du document a échoué.",
        });
      } finally {
        setIsConverting(false);
      }
    },
    [activeDocument, backendUrl, isConverting],
  );

  const removeMissingSourcePages = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    const availableDocumentIds = new Set(documents.map((document) => document.id));
    updateActiveOrganizationPlan((plan) => ({
      ...plan,
      pages: renumberOrganizedPages(
        plan.pages.filter((page) => availableDocumentIds.has(page.sourceDocumentId)),
      ),
    }));
    setSelectedPageIdsByDocument((currentSelection) => {
      const selectedPageId = currentSelection[activeDocument.id];
      const selectedPage = activeOrganizationPlan?.pages.find((page) => page.id === selectedPageId);

      return {
        ...currentSelection,
        [activeDocument.id]: selectedPage && !availableDocumentIds.has(selectedPage.sourceDocumentId)
          ? null
          : selectedPageId ?? null,
      };
    });
  }, [activeDocument, activeOrganizationPlan, documents, updateActiveOrganizationPlan]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isRestoringDocuments) {
      setStatus("Restauration en cours...");
      event.currentTarget.value = "";
      return;
    }

    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (selectedFiles.length === 0) {
      return;
    }

    const pdfFiles = selectedFiles.filter(
      (file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
    );

    if (pdfFiles.length === 0) {
      setStatus("Choisissez un fichier PDF.");
      return;
    }

    setExportFeedback(null);
    setStatus(
      pdfFiles.length === 1 ? "Ouverture du PDF..." : `Ouverture de ${pdfFiles.length} PDF...`,
    );

    const openedDocuments: OpenPdfDocument[] = [];
    const failedFileNames: string[] = [];

    for (const file of pdfFiles) {
      try {
        openedDocuments.push(await loadOpenPdfDocument(file));
      } catch {
        failedFileNames.push(file.name);
      }
    }

    if (openedDocuments.length > 0) {
      setDocuments((currentDocuments) => [...currentDocuments, ...openedDocuments]);
      setActiveDocumentId(openedDocuments[openedDocuments.length - 1].id);
      pendingFocusTargetRef.current = "viewer";
      openedDocuments.forEach((openedDocument) => {
        if (!import.meta.env.MODE.startsWith("test")) void loadPdfComments(backendUrl, openedDocument.file).then((comments) => {
          if (comments.length) dispatchPdfEdits({ type: "hydrate", documentId: openedDocument.id, edits: comments });
        });
      });
    }

    const usageWarnings = openedDocuments.flatMap((openedDocument, index) =>
      getDocumentUsageWarnings(openedDocument.file, openedDocument.pageCount, documents.length + index + 1),
    );

    if (failedFileNames.length > 0) {
      const failureMessage =
        failedFileNames.length === 1
          ? `Impossible d'ouvrir ${failedFileNames[0]}.`
          : `${failedFileNames.length} PDF n'ont pas pu être ouverts.`;
      setStatus([failureMessage, ...usageWarnings.map((warning) => `Avertissement: ${warning}`)].join(" "));
      return;
    }

    const ignoredFiles = selectedFiles.length - pdfFiles.length;
    const ignoredFilesMessage = ignoredFiles > 0 ? `${ignoredFiles} fichier non PDF ignoré.` : "";
    setStatus([ignoredFilesMessage, ...usageWarnings.map((warning) => `Avertissement: ${warning}`)].filter(Boolean).join(" "));
  }

  useEffect(() => {
    const closeShapePicker = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsShapePickerOpen(false);
      }
    };
    window.addEventListener("keydown", closeShapePicker);
    return () => window.removeEventListener("keydown", closeShapePicker);
  }, []);

  useEffect(() => {
    if (!isShapePickerOpen) {
      return;
    }

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !shapePickerRef.current?.contains(target) &&
        !shapePickerButtonRef.current?.contains(target)
      ) {
        setIsShapePickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [isShapePickerOpen]);

  const startPropertiesResize = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = propertiesPanelWidth;
    const resize = (moveEvent: globalThis.MouseEvent) => {
      setPropertiesPanelWidth(
        Math.min(460, Math.max(220, startWidth + startX - moveEvent.clientX)),
      );
    };
    const finish = () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finish);
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finish);
  }, [propertiesPanelWidth]);

  const toggleShapePicker = useCallback(() => {
    if (isShapePickerOpen) {
      setIsShapePickerOpen(false);
      return;
    }

    const anchor = shapePickerButtonRef.current?.getBoundingClientRect();
    if (!anchor) {
      return;
    }

    const pickerWidth = 9.5 * 16;
    const pickerHeight = 3.5 * 16;
    const left = anchor.right + 8 + pickerWidth <= window.innerWidth
      ? anchor.right + 8
      : Math.max(8, anchor.left - pickerWidth - 8);
    setShapePickerPosition({
      top: Math.min(Math.max(8, anchor.top), window.innerHeight - pickerHeight - 8),
      left,
    });
    setIsShapePickerOpen(true);
  }, [isShapePickerOpen]);

  if (isRestoringDocuments) {
    return (
      <AppStateScreen
        state="loading"
        title="Restauration en cours"
        description="Préparation de vos documents locaux…"
      />
    );
  }

  if (restorationError) {
    return (
      <AppStateScreen
        state="error"
        title="Impossible de restaurer vos documents"
        description="L’application n’a pas pu terminer son initialisation."
        action={
          <button
            type="button"
            onClick={() => {
              setRestorationError(null);
              setIsRestoringDocuments(true);
              setRestorationAttempt((attempt) => attempt + 1);
            }}
          >
            Réessayer
          </button>
        }
        details={<code>{restorationError}</code>}
      />
    );
  }

  return (
    <main
      ref={presentationContainerRef}
      className={viewerMode === "presentation" ? "app-shell app-shell--presentation" : "app-shell"}
    >
      <header
        className="toolbar toolbar--sticky"
        role="region"
        aria-label="Contrôles PDF"
      >
        <div className="app-brand">
          <AppLogo className="app-brand__mark" size={24} />
          <h1>PDF Studio Local</h1>
        </div>

        <div className="toolbar-actions" aria-label="Actions PDF">
          <div className="toolbar-action-group toolbar-actions__primary" aria-label="Actions principales">
            <button type="button" className="toolbar-icon-button" aria-label="Ouvrir un PDF" title="Ouvrir un PDF" onClick={() => openFileInputRef.current?.click()}><ToolbarIcon name="open" /></button>
            <button type="button" className="toolbar-icon-button" aria-label="Enregistrer sous…" title="Enregistrer sous… (Ctrl+Shift+S)" onClick={openActiveSaveAsDialog} disabled={!activeDocument || !isActiveDocumentDirty || isExporting}><ToolbarIcon name="save-as" /></button>
            <button type="button" className="toolbar-icon-button toolbar-icon-button--danger" aria-label="Réinitialiser les données locales" title="Réinitialiser les données locales" onClick={clearLocalData}><ResetIcon /></button>
          </div>
          <span className="toolbar-actions__spacer" aria-hidden="true" />
          <button type="button" className="toolbar-icon-button" role="switch" aria-label="Basculer le thème" aria-checked={theme === "dark"} title={theme === "light" ? "Passer au thème sombre" : "Passer au thème clair"} onClick={toggleTheme}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span></button>
          <div className="toolbar-action-group" aria-label="Fichier">
            <div className="insert-menu file-menu">
              <button
                type="button"
                onClick={() => setIsFileMenuOpen((isOpen) => !isOpen)}
                disabled={!activeDocument}
                aria-haspopup="menu"
                aria-expanded={isFileMenuOpen}
              >
                Fichier <span aria-hidden="true">▾</span>
              </button>
              {isFileMenuOpen && activeDocument ? (
                <div className="insert-menu__items file-menu__items" role="menu" aria-label="Fichier">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openActiveSaveAsDialog}
                    disabled={!isActiveDocumentDirty || isExporting}
                  >
                    Enregistrer sous…
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="toolbar-action-group" role="group" aria-label="Historique">
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={undoPdfEdit}
              disabled={!activeDocumentEditingState?.canUndo}
              aria-label="Annuler"
              aria-keyshortcuts="Control+Z Meta+Z"
              title="Annuler (Ctrl+Z)"
            >
              <ToolbarIcon name="undo" />
            </button>
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={redoPdfEdit}
              disabled={!activeDocumentEditingState?.canRedo}
              aria-label="Rétablir"
              aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
              title="Rétablir (Ctrl+Y)"
            >
              <ToolbarIcon name="redo" />
            </button>
          </div>
        </div>
        <DocumentTabs
          documents={documents}
          activeDocumentId={activeDocumentId}
          dirtyDocumentIds={dirtyDocumentIds}
          onSelectDocument={selectDocumentFromSidebar}
          onCloseDocument={closeDocument}
          onKeyDown={handleSidebarKeyDown}
          getDocumentButtonRef={(documentId) => (node) => {
            documentButtonRefs.current.set(documentId, node);
          }}
        />
      </header>
      {isSignatureDialogOpen ? (
        <SignatureDialog
          onCancel={() => {
            setIsSignatureDialogOpen(false);
            setActiveEditingTool("select");
          }}
          onConfirm={prepareSignatureImage}
        />
      ) : null}

      {pendingComment ? (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section className="unsaved-dialog comment-dialog" role="dialog" aria-modal="true" aria-labelledby="comment-dialog-title">
            <h2 id="comment-dialog-title">Nouveau commentaire</h2>
            <label>Rédacteur<input aria-label="Rédacteur" value={commentAuthorDraft} onChange={(event) => setCommentAuthorDraft(event.target.value)} placeholder="Non renseigné" /></label>
            <label>Message</label>
            <textarea autoFocus value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} aria-label="Texte du commentaire" placeholder="Saisissez votre commentaire…" rows={4} />
            <div className="unsaved-dialog__actions">
              <button type="button" onClick={() => { setPendingComment(null); setCommentDraft(""); setActiveEditingTool("select"); }}>Annuler</button>
              <button type="button" onClick={addComment} disabled={!commentDraft.trim()}>Ajouter</button>
            </div>
          </section>
        </div>
      ) : null}

      {saveAsDocument ? (
        <SaveAsDialog
          suggestedName={getSuggestedPdfSaveName(
            saveAsDocument.fileName,
            saveAsDocument.workingSaveName,
          )}
          isSaving={isExporting}
          errorMessage={
            exportFeedback?.kind === "error" ? exportFeedback.message : null
          }
          onCancel={cancelSaveAsDialog}
          onSave={saveDocumentAs}
        />
      ) : null}

      {pendingCloseDocument ? (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section
            className="unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-dialog-title"
          >
            <h2 id="unsaved-dialog-title">Modifications non sauvegardées</h2>
            <p>
              {pendingCloseDocument.fileName} contient des modifications non
              sauvegardées.
            </p>
            <div className="unsaved-dialog__actions">
              <button
                type="button"
                onClick={savePendingCloseDocument}
                disabled={isExporting}
              >
                Enregistrer sous…
              </button>
              <button
                type="button"
                onClick={() => {
                  const documentId = pendingCloseDocument.id;
                  setPendingCloseDocumentId(null);
                  setCloseAfterSaveDocumentId(null);
                  performCloseDocument(documentId);
                }}
                disabled={isExporting}
              >
                Ignorer les modifications
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingCloseDocumentId(null);
                  setCloseAfterSaveDocumentId(null);
                }}
                disabled={isExporting}
              >
                Annuler
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isOcrDialogOpen && activeDocument ? (
        <OcrDialog
          sourceFileName={activeDocument.fileName}
          hasPendingOrganizationChanges={hasPendingOrganizationChanges}
          isProcessing={isOcrProcessing}
          onCancel={() => setIsOcrDialogOpen(false)}
          onSubmit={(options) => void runOcrOnActiveDocument(options)}
        />
      ) : null}

      {isConversionDialogOpen && activeDocument ? (
        <ConversionDialog
          sourceFileName={activeDocument.fileName}
          sourcePageCount={activeDocument.pageCount}
          hasPendingOrganizationChanges={hasPendingOrganizationChanges}
          isProcessing={isConverting}
          onCancel={() => setIsConversionDialogOpen(false)}
          onSubmit={(options) => void convertActiveDocument(options)}
        />
      ) : null}

      <section
        className={`${isSidebarVisible ? "content-area" : "content-area content-area--sidebar-hidden"}${isPropertiesPanelVisible ? "" : " content-area--properties-hidden"}`}
        aria-label="Espace de travail PDF"
        style={{ "--properties-panel-width": `${propertiesPanelWidth}px` } as CSSProperties}
      >
        <nav className="tool-rail" aria-label="Outils d'édition">
          <button
            type="button"
            onClick={() => {
              setActiveEditingTool("select");
              setPendingSignatureImageId(null);
              setEyedropperTarget(null);
            }}
            disabled={!activeDocument || workspaceMode !== "read"}
            aria-label="Sélection"
            aria-pressed={activeEditingTool === "select" && workspaceMode === "read"}
            title="Sélection"
          >
            <ToolbarIcon name="select" />
            <span>Sélection</span>
          </button>

          <button type="button" onClick={() => { setActiveEditingTool("freehand"); setSelectedEditId(null); setPendingSignatureImageId(null); setEyedropperTarget(null); }} disabled={!activeDocument || workspaceMode !== "read"} aria-label="Dessiner" aria-pressed={activeEditingTool === "freehand"} title="Dessiner">
            <ToolbarIcon name="freehand" /><span>Dessin</span>
          </button>
          <button type="button" onClick={() => { setActiveEditingTool("comment"); setSelectedEditId(null); setPendingSignatureImageId(null); setEyedropperTarget(null); }} disabled={!activeDocument || workspaceMode !== "read"} aria-label="Ajouter un commentaire" aria-pressed={activeEditingTool === "comment"} title="Ajouter un commentaire">
            <ToolbarIcon name="comment" /><span>Commentaire</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setActiveEditingTool("add_text");
              setPendingSignatureImageId(null);
              setSelectedEditId(null);
              setEyedropperTarget(null);
            }}
            disabled={!activeDocument || workspaceMode !== "read"}
            aria-label="Ajouter du texte"
            aria-pressed={activeEditingTool === "add_text"}
            title="Ajouter du texte"
          >
            <ToolbarIcon name="text" />
            <span>Texte</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setActiveEditingTool("edit_text");
              setPendingSignatureImageId(null);
              setSelectedEditId(null);
              setEyedropperTarget(null);
            }}
            disabled={!activeDocument || workspaceMode !== "read"}
            aria-label="Modifier le texte existant"
            aria-pressed={activeEditingTool === "edit_text"}
            title="Modifier le texte existant"
          >
            <ToolbarIcon name="text" />
            <span>Modifier texte</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setActiveEditingTool("signature");
              setSelectedEditId(null);
              setPendingSignatureImageId(null);
              setEyedropperTarget(null);
              setIsSignatureDialogOpen(true);
            }}
            disabled={!activeDocument || workspaceMode !== "read"}
            aria-label="Ajouter une signature"
            aria-pressed={activeEditingTool === "signature"}
            title="Ajouter une signature"
          >
            <ToolbarIcon name="signature" />
            <span>Signature</span>
          </button>

          <div className="tool-rail__shape-group">
            <button
              ref={shapePickerButtonRef}
              type="button"
              onClick={toggleShapePicker}
              disabled={!activeDocument || workspaceMode !== "read"}
              aria-label="Formes"
              aria-haspopup="menu"
              aria-expanded={isShapePickerOpen}
              aria-pressed={activeEditingTool.startsWith("shape_")}
              title="Formes"
            >
              <ToolbarIcon name="shape" />
              <span>Formes</span>
            </button>
          </div>

          <span className="tool-rail__separator" aria-hidden="true" />
          <button
            type="button"
            onClick={() =>
              setWorkspaceMode((currentMode) =>
                currentMode === "read" ? "organize" : "read",
              )
            }
            aria-pressed={workspaceMode === "organize"}
            aria-label={workspaceMode === "organize" ? "Revenir à la lecture" : "Organiser"}
            title={workspaceMode === "organize" ? "Revenir à la lecture" : "Organiser les pages"}
          >
            <ToolbarIcon name="organize" />
            <span>{workspaceMode === "organize" ? "Lecture" : "Organiser"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setIsOcrDialogOpen(true);
            }}
            disabled={!activeDocument || isOcrProcessing || isExporting || isConverting}
            aria-label="OCR"
            aria-busy={isOcrProcessing}
            title="Reconnaissance de texte (OCR)"
          >
            <ToolbarIcon name="ocr" />
            <span>OCR</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExportFeedback(null);
              setIsConversionDialogOpen(true);
            }}
            disabled={!activeDocument || isOcrProcessing || isExporting || isConverting}
            title="Convertir le document"
          >
            <ToolbarIcon name="conversion" />
            <span>Convertir</span>
          </button>
        </nav>

        <button
          type="button"
          className="sidebar-rail-toggle"
          onClick={() => setIsSidebarVisible((currentVisible) => !currentVisible)}
          aria-controls={sidebarId}
          aria-expanded={isSidebarVisible}
          aria-label={isSidebarVisible ? "Masquer la barre latérale" : "Afficher la barre latérale"}
        >
          <span aria-hidden="true">{isSidebarVisible ? "❮" : "❯"}</span>
        </button>

        {isSidebarVisible ? (
          <DocumentSidebar
            documents={documents}
            openFileInputRef={openFileInputRef}
            activePageNumber={activePageNumber}
            pagePlan={activeOrganizationPlan}
            onSelectPage={(pageNumber) => {
              recordActivePage(activeDocument?.id ?? "", pageNumber);
              setPageNavigationRequest({
                pageNumber,
                requestId: ++pageNavigationRequestId.current,
              });
            }}
            onFileChange={handleFileChange}
            status={status}
            storageWarning={storageWarning}
            sidebarId={sidebarId}
            onKeyDown={handleSidebarKeyDown}
            pageView={pageView}
            onPageViewChange={setPageView}
            comments={activeComments}
            commentsView={isCommentsView}
            selectedCommentId={selectedCommentEdit?.id ?? null}
            onCommentsViewChange={setIsCommentsView}
            onSelectComment={(comment) => {
              setSelectedEditId(comment.id);
              setIsCommentsView(true);
              recordActivePage(activeDocument?.id ?? "", comment.page);
              setPageNavigationRequest({ pageNumber: comment.page, commentId: comment.id, requestId: ++pageNavigationRequestId.current });
            }}
          />
        ) : null}

        <section className="workspace-stage" aria-label="Document actif">
          {isOcrProcessing ? (
          <div
            className="export-read-feedback organize-feedback organize-feedback--progress"
            role="status"
          >
            <span className="organize-spinner" aria-hidden="true" />
            <span>OCR en cours…</span>
          </div>
        ) : isConverting ? (
          <div
            className="export-read-feedback organize-feedback organize-feedback--progress"
            role="status"
          >
            <span className="organize-spinner" aria-hidden="true" />
            <span>Conversion en cours…</span>
          </div>
        ) : workspaceMode === "read" && exportFeedback ? (
          <div
            className={`export-read-feedback organize-feedback organize-feedback--${exportFeedback.kind}`}
            role={exportFeedback.kind === "error" ? "alert" : "status"}
          >
            <span>{exportFeedback.message}</span>
            <button type="button" onClick={() => setExportFeedback(null)} aria-label="Fermer le message">
              Fermer
            </button>
          </div>
          ) : null}

          {activeDocument && activeOrganizationPlan && workspaceMode === "read" ? (
          <PdfViewer
            backendUrl={backendUrl}
            document={activeDocument}
            documents={documents}
            pagePlan={activeOrganizationPlan}
            edits={activePdfEdits}
            signatureImages={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeEditingTool}
            freehandStyle={freehandToolStyle}
            pendingSignatureImage={pendingSignatureImage}
            eyedropperTarget={eyedropperTarget}
            onZoomChange={updateDocumentZoom}
            onScrollPositionChange={updateDocumentScrollPosition}
            onAddText={addTextEdit}
            onAddNativeText={addNativeTextEdit}
            onAddShape={addShapeEdit}
            onAddFreehand={addFreehandEdit}
            onStartComment={startComment}
            onPlaceSignature={placeSignature}
            onSelectEdit={setSelectedEditId}
            onDeselectEdit={() => setSelectedEditId(null)}
            onUpdateEdit={updatePdfEdit}
            onDeleteEdit={deletePdfEdit}
            onActivePageChange={recordActivePage}
            onSampleColor={applySampledShapeColor}
            fontLibraryRevision={fontLibraryRevision}
            focusRequest={viewerFocusRequest}
            pageNavigationRequest={pageNavigationRequest}
            viewerMode={viewerMode}
            activePageNumber={activePageNumber}
            onZoomSet={setDocumentZoom}
            shouldFitToPage={fitToPageByDocument[activeDocument.id] ?? true}
            fitRefreshToken={presentationFitRefreshToken}
          />
        ) : activeDocument && activeOrganizationPlan ? (
          <OrganizePages
            document={activeDocument}
            documents={documents}
            plan={activeOrganizationPlan}
            selectedPageId={selectedOrganizedPageId}
            outputName={outputName}
            saveToOutputDir={saveToOutputDir}
            isExporting={isExporting}
            exportFeedback={exportFeedback}
            onToggleSelection={toggleOrganizedPageSelection}
            onMovePageByIndex={moveOrganizedPage}
            onDeletePage={deleteOrganizedPage}
            onDuplicatePage={duplicateOrganizedPage}
            onRotatePage={rotateOrganizedPage}
            onReset={resetActiveOrganizationPlan}
            onOutputNameChange={(nextOutputName) => {
              setExportFeedback(null);
              setOutputName(nextOutputName);
            }}
            onSaveToOutputDirChange={(shouldSaveToOutputDir) => {
              setExportFeedback(null);
              setSaveToOutputDir(shouldSaveToOutputDir);
            }}
            onExport={exportActiveOrganizationPlan}
            onAddExternalPages={addExternalPagesFromOpenDocument}
            onDismissExportFeedback={() => setExportFeedback(null)}
            onRemoveMissingSourcePages={removeMissingSourcePages}
          />
        ) : (
          <EmptyState status={status} mode={workspaceMode} />
          )}
        </section>

        {isPropertiesPanelVisible ? <aside className="properties-panel" aria-label="Propriétés">
          <button type="button" className="properties-panel__resize" aria-label="Redimensionner les propriétés" onMouseDown={startPropertiesResize} />
          <header className="properties-panel__header">
            <div><span>Inspecteur</span><h2>Propriétés</h2></div>
            <button type="button" aria-label="Masquer les propriétés" title="Masquer les propriétés" onClick={() => setIsPropertiesPanelVisible(false)}>❯</button>
          </header>
          {workspaceMode === "read" && (selectedTextEdit || selectedNativeTextEdit) ? (
            <TextEditToolbar
              edit={(selectedTextEdit ?? selectedNativeTextEdit)!}
              onUpdate={(patch) =>
                updatePdfEdit({ ...(selectedTextEdit ?? selectedNativeTextEdit)!, ...patch } as PdfEdit)
              }
              onDelete={() => deletePdfEdit((selectedTextEdit ?? selectedNativeTextEdit)!.id)}
              onLibraryChange={() => setFontLibraryRevision((revision) => revision + 1)}
            />
          ) : workspaceMode === "read" && selectedShapeEdit ? (
            <ShapeEditToolbar
              edit={selectedShapeEdit}
              eyedropperTarget={eyedropperTarget}
              onUpdate={(patch, coalesceKey) =>
                updatePdfEdit(
                  { ...selectedShapeEdit, ...patch },
                  coalesceKey ? `${selectedShapeEdit.id}:${coalesceKey}` : undefined,
                )
              }
              onFinishUpdate={(coalesceKey) => finishPdfEditCoalescing(selectedShapeEdit.id, coalesceKey)}
              onPickColor={(target) =>
                setEyedropperTarget((currentTarget) =>
                  currentTarget === target ? null : target,
                )
              }
              onDelete={() => deletePdfEdit(selectedShapeEdit.id)}
            />
          ) : workspaceMode === "read" && freehandInspectorEdit ? (
            <FreehandEditToolbar
              edit={freehandInspectorEdit}
              onUpdate={(patch, coalesceKey) => {
                const edit = { ...freehandInspectorEdit, ...patch };
                if (edit.style) {
                  setFreehandToolStyle({
                    ...edit.style,
                    opacity: edit.style.opacity ?? 1,
                  });
                }
                if (selectedFreehandEdit) {
                  updatePdfEdit(
                    edit,
                    coalesceKey ? `${selectedFreehandEdit.id}:${coalesceKey}` : undefined,
                  );
                }
              }}
              onFinishUpdate={(coalesceKey) => {
                if (selectedFreehandEdit) {
                  finishPdfEditCoalescing(selectedFreehandEdit.id, coalesceKey);
                }
              }}
              onDelete={selectedFreehandEdit ? () => deletePdfEdit(selectedFreehandEdit.id) : undefined}
            />
          ) : workspaceMode === "read" && selectedTextMarkupEdit ? (
            <section className="shape-edit-toolbar" aria-label="Propriétés de l'annotation texte"><strong>{selectedTextMarkupEdit.kind === "highlight" ? "Surlignage" : selectedTextMarkupEdit.kind === "underline" ? "Soulignement" : "Barré"}</strong><ColorPicker label="Couleur de l'annotation" value={selectedTextMarkupEdit.color} onChange={(color) => updatePdfEdit({ ...selectedTextMarkupEdit, color })} /><button type="button" onClick={() => deletePdfEdit(selectedTextMarkupEdit.id)}>Supprimer l'annotation</button></section>
          ) : workspaceMode === "read" && selectedCommentEdit ? (
            <CommentInspector edit={selectedCommentEdit} onUpdate={updatePdfEdit} onDelete={() => deletePdfEdit(selectedCommentEdit.id)} />
          ) : selectedPdfEdit?.type === "signature" ? (
            <section className="properties-panel__empty">
              <strong>Signature</strong>
              <p>Déplacez ou redimensionnez la signature directement sur la page.</p>
              <button type="button" onClick={() => deletePdfEdit(selectedPdfEdit.id)}>
                Supprimer la signature
              </button>
            </section>
          ) : (
            <section className="properties-panel__empty">
              <strong>{workspaceMode === "organize" ? "Organisation" : "Document"}</strong>
              <p>
                {activeDocument
                  ? `${activeOrganizationPlan?.pages.length ?? activeDocument.pageCount} page${(activeOrganizationPlan?.pages.length ?? activeDocument.pageCount) > 1 ? "s" : ""}`
                  : "Aucun document ouvert"}
              </p>
              <span>
                {workspaceMode === "organize"
                  ? "Réorganisez les pages sans enregistrer automatiquement."
                  : "Sélectionnez un élément pour afficher ses réglages."}
              </span>
            </section>
          )}
        </aside> : <button type="button" className="properties-panel-toggle" aria-label="Afficher les propriétés" title="Afficher les propriétés" onClick={() => setIsPropertiesPanelVisible(true)}>❮</button>}
      </section>

      {isShapePickerOpen
        ? createPortal(
            <div
              ref={shapePickerRef}
              className="shape-picker"
              role="menu"
              aria-label="Formes"
              style={shapePickerPosition}
            >
              {(["rectangle", "ellipse", "line"] as const).map((shapeType) => {
                const label = shapeType === "rectangle" ? "Rectangle" : shapeType === "ellipse" ? "Ellipse" : "Ligne";
                const icon = shapeType === "rectangle" ? "▭" : shapeType === "ellipse" ? "○" : "╱";
                return (
                  <button
                    key={shapeType}
                    type="button"
                    role="menuitem"
                    aria-label={label}
                    aria-pressed={activeEditingTool === `shape_${shapeType}`}
                    title={label}
                    onClick={() => {
                      setExportFeedback(null);
                      setActiveEditingTool(`shape_${shapeType}`);
                      setPendingSignatureImageId(null);
                      setSelectedEditId(null);
                      setEyedropperTarget(null);
                      setIsShapePickerOpen(false);
                    }}
                  >
                    <span aria-hidden="true">{icon}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

      {textMarkupSelection ? createPortal(
        <div ref={textMarkupToolbarRef} className="text-markup-toolbar" role="toolbar" aria-label="Annotations du texte" style={{ top: Math.max(8, textMarkupSelection.top - 46), left: Math.min(window.innerWidth - 230, Math.max(8, textMarkupSelection.left - 100)) }}>
          <button type="button" title="Surligner" aria-label="Surligner" onClick={() => addTextMarkupEdit("highlight", textMarkupColor)}>🖍</button>
          <button type="button" title="Souligner" aria-label="Souligner" onClick={() => addTextMarkupEdit("underline", textMarkupColor)}>U̲</button>
          <button type="button" title="Barrer" aria-label="Barrer" onClick={() => addTextMarkupEdit("strikeout", textMarkupColor)}>S̶</button>
          <ColorPicker compact label="Couleur de l'annotation" value={textMarkupColor} onChange={setTextMarkupColor} />
        </div>, document.body) : null}

      <footer className="status-bar" aria-label="État du document">
        <span>
          {activeDocument
            ? `Page ${activePageNumber} / ${activeOrganizationPlan?.pages.length ?? activeDocument.pageCount}`
            : "Aucun document"}
        </span>
        <span
          className="status-bar__document"
          title={activeDocument?.fileName}
        >
          {activeDocument?.fileName ?? ""}
        </span>
        <div className="page-controls" aria-label="Affichage et zoom">
          <label className="viewer-mode-control">
            <span className="sr-only">Mode d'affichage</span>
            <select
              value={viewerMode}
              onChange={(event) => {
                changeViewerMode(event.target.value as ViewerMode);
                // A native select keeps focus after selection and would otherwise
                // intentionally suppress the global page-navigation shortcuts.
                event.currentTarget.blur();
              }}
              disabled={!activeDocument || workspaceMode === "organize"}
              aria-label="Mode d'affichage"
              title="Choisir le mode d'affichage"
            >
              <option value="continuous">Continu</option>
              <option value="single-page">Page unique</option>
              <option value="presentation">Présentation</option>
            </select>
          </label>
          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button
              type="button"
              className="zoom-controls__fit"
              onClick={() => {
                if (activeDocument) {
                  setFitToPageByDocument((currentModes) => ({ ...currentModes, [activeDocument.id]: true }));
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || viewerMode === "continuous"}
              aria-label="Ajuster à la page"
              title="Ajuster la page à l'espace disponible"
            >
              Ajuster
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeDocument) {
                  updateDocumentZoom(activeDocument.id, -ZOOM_STEP);
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || activeDocument.zoom <= MIN_ZOOM}
              aria-label="Réduire le zoom"
              title="Réduire le zoom"
            >
              −
            </button>
            <span className="zoom-value" data-testid="zoom-level" aria-live="polite">
              {activeDocument ? `${Math.round(activeDocument.zoom * 100)}%` : "—"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activeDocument) {
                  updateDocumentZoom(activeDocument.id, ZOOM_STEP);
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || activeDocument.zoom >= MAX_ZOOM}
              aria-label="Augmenter le zoom"
              title="Augmenter le zoom"
            >
              +
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

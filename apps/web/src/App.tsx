import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
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
import { SaveAsDialog } from "./components/SaveAsDialog";
import {
  SignatureDialog,
  type SignatureImageDraft,
} from "./components/SignatureDialog";
import {
  DEFAULT_TEXT_STYLE,
  type AddTextEdit,
  type EditingTool,
  type PdfEdit,
  type PdfRect,
  type SignatureEdit,
  type SignatureImage,
} from "./editing/types";
import { offsetPdfRectWithinPage } from "./editing/coordinates";
import {
  getDocumentEditingState,
  pdfEditsReducer,
} from "./editing/state";
import { downloadPdfToBrowser } from "./saving/destination";
import { getSuggestedPdfSaveName } from "./saving/fileName";
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
  activeDocumentId: string | null;
  dirtyDocumentIds: ReadonlySet<string>;
  theme: ThemeMode;
  openFileInputRef: RefObject<HTMLInputElement | null>;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onToggleTheme: () => void;
  onClearLocalData: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  status: string;
  storageWarning: string | null;
  sidebarId: string;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  getDocumentButtonRef: (documentId: string) => (node: HTMLButtonElement | null) => void;
};

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

function buildViewerSnapshot(document: OpenPdfDocument): ViewerDocumentSnapshot {
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
  };
}

async function restoreOpenDocument(storedDocument: StoredPdfDocument): Promise<OpenPdfDocument> {
  if (!(storedDocument.content instanceof Blob) || storedDocument.content.size === 0) {
    throw new Error("Le document restauré ne contient plus de données PDF valides.");
  }
  const file = new File([storedDocument.content], storedDocument.fileName, {
    type: storedDocument.mimeType || "application/pdf",
  });
  const data = new Uint8Array(await file.arrayBuffer());
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
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  edits: PdfEdit[];
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  pendingSignatureImage: SignatureImage | null;
  scrollRootRef: RefObject<HTMLElement | null>;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit) => void;
  onDeleteEdit: (editId: string) => void;
};

function PdfPageCanvas({
  pdfDocument,
  pageNumber,
  zoom,
  edits,
  signatureImages,
  selectedEditId,
  activeTool,
  pendingSignatureImage,
  scrollRootRef,
  registerPageRef,
  onAddText,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onDeleteEdit,
}: PdfPageCanvasProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [viewport, setViewport] = useState<PageViewport | null>(null);

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
        const page = await pdfDocument.getPage(pageNumber);

        if (
          isCancelled ||
          !canvas ||
          !surface ||
          !textLayerContainer
        ) {
          return;
        }

        const viewport = page.getViewport({ scale: zoom });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        surface.style.width = `${viewport.width}px`;
        surface.style.height = `${viewport.height}px`;
        surface.style.minWidth = "0";
        surface.style.minHeight = "0";
        setViewport(viewport);

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

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
  }, [pageNumber, pdfDocument, shouldRender, zoom]);

  useEffect(() => {
    return () => {
      clearCanvas(canvasRef.current);
    };
  }, []);

  return (
    <article
      ref={(node) => {
        pageRef.current = node;
        registerPageRef(pageNumber, node);
      }}
      className="pdf-page"
      data-page-number={pageNumber}
      aria-label={`Page ${pageNumber}`}
    >
      <div className="page-number">Page {pageNumber}</div>
      <div
        ref={surfaceRef}
        className="page-surface"
        onClick={() => {
          if (activeTool === "select") {
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
        <div
          ref={textLayerRef}
          className="textLayer pdf-text-layer"
          hidden
        />
        {viewport ? (
          <PdfEditLayer
            pageNumber={pageNumber}
            viewport={viewport}
            edits={edits}
            images={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeTool}
            pendingSignatureImage={pendingSignatureImage}
            onAddText={(rect) => onAddText(pageNumber, rect)}
            onPlaceSignature={(rect) => onPlaceSignature(pageNumber, rect)}
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
  document: OpenPdfDocument;
  edits: PdfEdit[];
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  pendingSignatureImage: SignatureImage | null;
  onZoomChange: (documentId: string, delta: number) => void;
  onScrollPositionChange: (documentId: string, scrollLeft: number, scrollTop: number) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit) => void;
  onDeleteEdit: (editId: string) => void;
  onActivePageChange: (documentId: string, pageNumber: number) => void;
  focusRequest: number;
};

function PdfViewer({
  document,
  edits,
  signatureImages,
  selectedEditId,
  activeTool,
  pendingSignatureImage,
  onZoomChange,
  onScrollPositionChange,
  onAddText,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onDeleteEdit,
  onActivePageChange,
  focusRequest,
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
  const pages = useMemo(
    () => Array.from({ length: document.pageCount }, (_, index) => index + 1),
    [document.pageCount],
  );

  const registerPageRef = useCallback((pageNumber: number, node: HTMLElement | null) => {
    if (node === null) {
      pageRefs.current.delete(pageNumber);
      return;
    }

    pageRefs.current.set(pageNumber, node);
  }, []);

  const getCurrentPageNumber = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return 1;
    }

    const targetScrollTop = viewer.scrollTop + viewer.clientHeight / 2;
    let currentPageNumber = 1;

    for (const pageNumber of pages) {
      const pageElement = pageRefs.current.get(pageNumber);

      if (!pageElement) {
        continue;
      }

      const pageTop = pageElement.offsetTop;
      const pageBottom = pageTop + pageElement.offsetHeight;

      if (targetScrollTop >= pageTop && targetScrollTop < pageBottom) {
        return pageNumber;
      }

      if (targetScrollTop >= pageTop) {
        currentPageNumber = pageNumber;
      }
    }

    return currentPageNumber;
  }, [pages]);

  useEffect(() => {
    onActivePageChange(document.id, getCurrentPageNumber());
  }, [document.id, getCurrentPageNumber, onActivePageChange]);

  const scrollPageIntoView = useCallback((pageNumber: number) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(pageNumber);

    if (!viewer || !pageElement) {
      return;
    }

    viewer.scrollTo({
      top: pageElement.offsetTop,
      behavior: "smooth",
    });
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

    if (!viewer || lastFocusRequestRef.current === focusRequest) {
      return;
    }

    lastFocusRequestRef.current = focusRequest;
    viewer.focus();
  }, [document.id, focusRequest]);

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
          if (currentPageNumber < document.pageCount) {
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
    [document.id, document.pageCount, getCurrentPageNumber, scrollPageIntoView],
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
          : activeTool !== "select"
            ? "viewer viewer--text-tool"
            : "viewer viewer--pan-enabled"
      }
      aria-label={`Aperçu PDF ${document.fileName}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
    >
      {document.error ? <p className="status">{document.error}</p> : null}
      <div className="pdf-document" aria-label={`Document PDF ${document.fileName}`}>
        {pages.map((pageNumber) => (
          <PdfPageCanvas
            key={`${document.id}-${pageNumber}`}
            pdfDocument={document.pdfDocument}
            pageNumber={pageNumber}
            zoom={document.zoom}
            edits={edits.filter((edit) => edit.page === pageNumber)}
            signatureImages={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeTool}
            pendingSignatureImage={pendingSignatureImage}
            scrollRootRef={viewerRef}
            registerPageRef={registerPageRef}
            onAddText={onAddText}
            onPlaceSignature={onPlaceSignature}
            onSelectEdit={onSelectEdit}
            onDeselectEdit={onDeselectEdit}
            onUpdateEdit={onUpdateEdit}
            onDeleteEdit={onDeleteEdit}
          />
        ))}
      </div>
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

function DocumentSidebar({
  documents,
  activeDocumentId,
  dirtyDocumentIds,
  theme,
  openFileInputRef,
  onSelectDocument,
  onCloseDocument,
  onToggleTheme,
  onClearLocalData,
  onFileChange,
  status,
  storageWarning,
  sidebarId,
  onKeyDown,
  getDocumentButtonRef,
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
        <div>
          <h2>Documents ouverts</h2>
          <p className="sidebar-hint">
            {documents.length > 0 ? "Sélectionnez un PDF pour l'afficher." : "Aucun PDF ouvert."}
          </p>
        </div>
      </div>

      <div className="document-sidebar__content">
        <div className="document-sidebar__scroll-area">
          {status ? <p className="sidebar-status">{status}</p> : null}
          {storageWarning ? (
            <p className="sidebar-status" role="alert">
              {storageWarning}
            </p>
          ) : null}

          {documents.length > 0 ? (
            <ul className="document-list" aria-label="Liste des documents ouverts">
              {documents.map((document) => {
                const isActive = document.id === activeDocumentId;
                const isDirty = dirtyDocumentIds.has(document.id);
                const dirtyDescriptionId = `document-dirty-${document.id}`;

                return (
                  <li key={document.id} className={isActive ? "document-item is-active" : "document-item"}>
                    <button
                      type="button"
                      className="document-select"
                      data-document-id={document.id}
                      ref={getDocumentButtonRef(document.id)}
                      onClick={() => onSelectDocument(document.id)}
                      aria-current={isActive ? "true" : undefined}
                      aria-selected={isActive}
                      aria-describedby={isDirty ? dirtyDescriptionId : undefined}
                      tabIndex={isActive ? 0 : -1}
                      aria-label={`${document.fileName}${isActive ? ", document actif" : ""}`}
                      title={document.fileName}
                    >
                      <span className="document-title">
                        {document.fileName}
                        {isDirty ? (
                          <span
                            className="document-dirty-indicator"
                            aria-hidden="true"
                            title="Modifications non sauvegardées"
                          >
                            ●
                          </span>
                        ) : null}
                      </span>
                      {isDirty ? (
                        <span id={dirtyDescriptionId} className="visually-hidden">
                          Modifications non sauvegardées.
                        </span>
                      ) : null}
                      <span className="document-meta-line">
                        {document.pageCount} page{document.pageCount > 1 ? "s" : ""}
                      </span>
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
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="sidebar-empty-state">
              <p>Aucun document ouvert.</p>
              <p>Ouvrez un PDF avec le bouton en bas de la barre latérale.</p>
            </div>
          )}
        </div>

        <footer className="sidebar-footer" aria-label="Actions secondaires">
          <div className="sidebar-footer__primary">
            <section className="sidebar-section sidebar-section--compact" aria-label="Apparence">
              <button
                type="button"
                className={theme === "dark" ? "theme-switch theme-switch--dark" : "theme-switch"}
                role="switch"
                aria-label="Basculer le thème"
                aria-checked={theme === "dark"}
                title={theme === "light" ? "Basculer vers le mode sombre" : "Basculer vers le mode clair"}
                onClick={onToggleTheme}
              >
                <span className="theme-switch__icon" aria-hidden="true">
                  ☀
                </span>
                <span className="theme-switch__track" aria-hidden="true">
                  <span className="theme-switch__thumb" />
                </span>
                <span className="theme-switch__icon" aria-hidden="true">
                  ☾
                </span>
              </button>
            </section>

            <section className="sidebar-section sidebar-section--compact" aria-label="Réinitialisation">
              <button
                type="button"
                className="danger-button danger-button--compact"
                onClick={onClearLocalData}
                aria-label="Réinitialiser les données locales"
                title="Réinitialiser les données locales"
              >
                <ResetIcon />
              </button>
            </section>
          </div>

          <section className="sidebar-section sidebar-section--compact" aria-label="Documents">
            <label className="sidebar-file-picker">
              <span>Ouvrir un PDF</span>
              <input
                ref={openFileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                onChange={onFileChange}
              />
            </label>
          </section>
        </footer>
      </div>
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

type ToolbarIconName = "save-as" | "text" | "signature" | "undo" | "redo";

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
      {name === "text" ? (
        <>
          <path d="M4 6V3h12v3" />
          <path d="M10 3v14" />
          <path d="M7 17h6" />
        </>
      ) : null}
      {name === "signature" ? (
        <>
          <path d="M3 14c2.4-4.8 3.9-7.2 5.1-7.2 1.9 0-.9 7.5.8 7.5 1.1 0 2.1-3.5 3.2-3.5.7 0 .2 3.2 1.2 3.2.6 0 1.4-1.4 2.1-1.4.6 0 .7.8 1.6.8" />
          <path d="M3 17h14" />
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
  const documentButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocusTargetRef = useRef<FocusTarget>(null);
  const sidebarId = "documents-sidebar";
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme(storedPreferences));
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => storedPreferences?.sidebarVisible ?? true);
  const [documents, setDocuments] = useState<OpenPdfDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("read");
  const [activeEditingTool, setActiveEditingTool] =
    useState<EditingTool>("select");
  const [pdfEditsByDocument, dispatchPdfEdits] = useReducer(
    pdfEditsReducer,
    {},
  );
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const clipboardEditRef = useRef<PdfEdit | null>(null);
  const pasteSequenceRef = useRef(0);
  const activePageByDocumentRef = useRef<Record<string, number>>({});
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
  const nextSignatureImageId = useRef(1);
  const nextSignatureEditId = useRef(1);
  const [isRestoringDocuments, setIsRestoringDocuments] = useState(
    () => (storedPreferences?.documentOrder.length ?? 0) > 0,
  );
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
  const selectedPdfEdit =
    activePdfEdits.find((edit) => edit.id === selectedEditId) ?? null;
  const pendingSignatureImage = pendingSignatureImageId
    ? (signatureImages[pendingSignatureImageId] ?? null)
    : null;
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
    }
  }, [activePdfEdits, selectedEditId]);

  useEffect(() => {
    if (documents.length === 0) {
      setWorkspaceMode("read");
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
      setIsRestoringDocuments(false);
    }

    void restoreDocuments();

    return () => {
      isCancelled = true;
    };
  }, [storedPreferences]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const preferencesSaved = saveViewerPreferences({
      theme,
      sidebarVisible: isSidebarVisible,
      activeDocumentId,
      documentOrder: documents.map((document) => document.id),
    });

    if (!preferencesSaved) {
      setStorageWarning("Les préférences locales n'ont pas pu être enregistrées. Vérifiez l'espace de stockage du navigateur.");
    }
  }, [activeDocumentId, documents, isRestoringDocuments, isSidebarVisible, theme]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const saveTimeout = window.setTimeout(() => {
      if (documents.length === 0) {
        void clearStoredDocuments();
        return;
      }

      void Promise.all(documents.map((document) => saveStoredDocument(buildViewerSnapshot(document)))).then((results) => {
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
  }, [documents, isRestoringDocuments]);

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

  const recordActivePage = useCallback(
    (documentId: string, pageNumber: number) => {
      activePageByDocumentRef.current[documentId] = pageNumber;
    },
    [],
  );

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
        style: { ...DEFAULT_TEXT_STYLE },
      };

      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const updatePdfEdit = useCallback(
    (edit: PdfEdit) => {
      if (!activeDocument) {
        return;
      }
      dispatchPdfEdits({ type: "replace", documentId: activeDocument.id, edit });
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const deletePdfEdit = useCallback(
    (editId: string) => {
      if (!activeDocument) {
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
    [activeDocument],
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
    const edit: PdfEdit =
      sourceEdit.type === "add_text"
        ? {
            ...clonePdfEdit(sourceEdit),
            id: `text-${Date.now()}-${nextTextEditId.current++}`,
            page: pageNumber,
            rect,
          }
        : {
            ...clonePdfEdit(sourceEdit),
            id: `signature-${Date.now()}-${nextSignatureEditId.current++}`,
            page: pageNumber,
            rect,
          };

    dispatchPdfEdits({ type: "add", documentId: targetDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument]);

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
        if (activeDocumentEditingState?.canRedo) {
          event.preventDefault();
          redoPdfEdit();
        }
        return;
      }
      if (key === "z") {
        if (activeDocumentEditingState?.canUndo) {
          event.preventDefault();
          undoPdfEdit();
        }
        return;
      }
      if (key === "y") {
        if (activeDocumentEditingState?.canRedo) {
          event.preventDefault();
          redoPdfEdit();
        }
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
    activeDocumentEditingState?.canRedo,
    activeDocumentEditingState?.canUndo,
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
    dispatchPdfEdits({ type: "clear" });
    setSelectedEditId(null);
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

      return { openedDocument, usageWarnings };
    },
    [documents, loadOpenPdfDocument],
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
            : signatureImages[edit.imageId] !== undefined;
        return pageIsExported && editIsExportable
          ? [{ ...edit, sourceDocumentId: documentId, order }]
          : [];
      }),
    );
    const exportedTextEdits = exportedPdfEdits.filter(
      (edit): edit is AddTextEdit & { sourceDocumentId: string; order: number } =>
        edit.type === "add_text",
    );
    const exportedSignatureEdits = exportedPdfEdits.filter(
      (edit): edit is SignatureEdit & {
        sourceDocumentId: string;
        order: number;
      } => edit.type === "signature",
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
        ...(exportedSignatureEdits.length > 0
          ? {
              signatures: exportedSignatureEdits,
              signatureImages: exportedSignatureImages,
            }
          : {}),
      }),
    );

    setIsExporting(true);
    setExportFeedback(null);

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

  return (
    <main className="app-shell">
      <section className="toolbar toolbar--sticky" aria-label="Contrôles PDF">
        <div className="file-controls">
          <h1>PDF Editor MVP</h1>
        </div>

        <div className="toolbar-actions" aria-label="Actions PDF">
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
                <div
                  className="insert-menu__items file-menu__items"
                  role="menu"
                  aria-label="Fichier"
                >
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
            <button
              type="button"
              className="toolbar-icon-button save-as-button"
              onClick={openActiveSaveAsDialog}
              disabled={!activeDocument || !isActiveDocumentDirty || isExporting}
              aria-label="Enregistrer sous…"
              aria-keyshortcuts="Control+S Meta+S Control+Shift+S Meta+Shift+S"
              title="Enregistrer sous… (Ctrl+Shift+S)"
            >
              <ToolbarIcon name="save-as" />
            </button>
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
          <div className="toolbar-action-group" aria-label="Outils du document">
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
              OCR
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
              Convertir
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode((currentMode) => (currentMode === "read" ? "organize" : "read"))}
              aria-pressed={workspaceMode === "organize"}
              aria-label={workspaceMode === "organize" ? "Revenir à la lecture" : "Organiser"}
              title={workspaceMode === "organize" ? "Revenir à la lecture" : "Organiser les pages"}
            >
              {workspaceMode === "organize" ? "Lecture" : "Organiser"}
            </button>
          </div>
          <div className="toolbar-action-group editing-tool-group" role="group" aria-label="Outils d'édition">
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={() => {
                setExportFeedback(null);
                setActiveEditingTool("add_text");
                setPendingSignatureImageId(null);
                setSelectedEditId(null);
              }}
              disabled={!activeDocument || workspaceMode !== "read"}
              aria-label="Ajouter du texte"
              aria-pressed={activeEditingTool === "add_text"}
              title="Ajouter du texte"
            >
              <ToolbarIcon name="text" />
            </button>
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={() => {
                setExportFeedback(null);
                setActiveEditingTool("signature");
                setSelectedEditId(null);
                setPendingSignatureImageId(null);
                setIsSignatureDialogOpen(true);
              }}
              disabled={!activeDocument || workspaceMode !== "read"}
              aria-label="Ajouter une signature"
              aria-pressed={activeEditingTool === "signature"}
              title="Ajouter une signature"
            >
              <ToolbarIcon name="signature" />
            </button>
          </div>
        </div>

        <div className="page-controls">
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
            -
          </button>
          <span className="zoom-value" data-testid="zoom-level" aria-live="polite">
            {activeDocument ? `${Math.round(activeDocument.zoom * 100)}%` : "-"}
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
      </section>

      {workspaceMode === "read" && selectedTextEdit ? (
        <TextEditToolbar
          edit={selectedTextEdit}
          onUpdate={(patch) =>
            updatePdfEdit({ ...selectedTextEdit, ...patch })
          }
          onDelete={() => deletePdfEdit(selectedTextEdit.id)}
        />
      ) : null}

      {isSignatureDialogOpen ? (
        <SignatureDialog
          onCancel={() => {
            setIsSignatureDialogOpen(false);
            setActiveEditingTool("select");
          }}
          onConfirm={prepareSignatureImage}
        />
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
        className={isSidebarVisible ? "content-area" : "content-area content-area--sidebar-hidden"}
        aria-label="Espace de travail PDF"
      >
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
            activeDocumentId={activeDocumentId}
            dirtyDocumentIds={dirtyDocumentIds}
            theme={theme}
            openFileInputRef={openFileInputRef}
            onSelectDocument={selectDocumentFromSidebar}
            onCloseDocument={closeDocument}
            onToggleTheme={toggleTheme}
            onClearLocalData={clearLocalData}
            onFileChange={handleFileChange}
            status={status}
            storageWarning={storageWarning}
            sidebarId={sidebarId}
            onKeyDown={handleSidebarKeyDown}
            getDocumentButtonRef={(documentId) => (node) => {
              documentButtonRefs.current.set(documentId, node);
            }}
          />
        ) : null}

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

        {activeDocument && workspaceMode === "read" ? (
          <PdfViewer
            document={activeDocument}
            edits={activePdfEdits}
            signatureImages={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeEditingTool}
            pendingSignatureImage={pendingSignatureImage}
            onZoomChange={updateDocumentZoom}
            onScrollPositionChange={updateDocumentScrollPosition}
            onAddText={addTextEdit}
            onPlaceSignature={placeSignature}
            onSelectEdit={setSelectedEditId}
            onDeselectEdit={() => setSelectedEditId(null)}
            onUpdateEdit={updatePdfEdit}
            onDeleteEdit={deletePdfEdit}
            onActivePageChange={recordActivePage}
            focusRequest={viewerFocusRequest}
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
    </main>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
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
  isPlanModified,
  isValidPagePlanForDocument,
  moveOrganizedPageByIndex,
  renumberOrganizedPages,
  rotatePage,
  type OrganizePagePlan,
  type OrganizedPage,
} from "./organize/pagePlan";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const VIEWER_PAN_STEP = 56;

type RenderState = "idle" | "loading" | "ready" | "error";
type WorkspaceMode = "read" | "organize";

type OpenPdfDocument = {
  id: string;
  fileName: string;
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
  theme: ThemeMode;
  openFileInputRef: RefObject<HTMLInputElement | null>;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onToggleTheme: () => void;
  onClearLocalData: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  status: string;
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
    mimeType: document.file.type,
    content: document.file,
    pageCount: document.pageCount,
    zoom: document.zoom,
    scrollLeft: document.scrollLeft,
    scrollTop: document.scrollTop,
  };
}

async function restoreOpenDocument(storedDocument: StoredPdfDocument): Promise<OpenPdfDocument> {
  const file = new File([storedDocument.content], storedDocument.fileName, {
    type: storedDocument.mimeType,
  });
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDocument = await loadingTask.promise;

  return {
    id: storedDocument.id,
    fileName: storedDocument.fileName,
    file,
    pdfDocument,
    loadingTask,
    pageCount: storedDocument.pageCount ?? pdfDocument.numPages,
    zoom: storedDocument.zoom,
    scrollLeft: storedDocument.scrollLeft,
    scrollTop: storedDocument.scrollTop,
    error: null,
  };
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

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.closest("button, input, textarea, select, a[href], [contenteditable='true']") !== null
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
  scrollRootRef: RefObject<HTMLElement | null>;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
};

function PdfPageCanvas({ pdfDocument, pageNumber, zoom, scrollRootRef, registerPageRef }: PdfPageCanvasProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");

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
    const canvas = canvasRef.current;

    if (!shouldRender || !canvas) {
      return;
    }

    async function renderPage() {
      setRenderState("loading");

      try {
        const page = await pdfDocument.getPage(pageNumber);

        if (isCancelled || !canvas) {
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
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

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
      <div className="page-surface">
        {renderState === "error" ? (
          <p className="page-error">Impossible d'afficher cette page.</p>
        ) : null}
        {renderState !== "ready" && renderState !== "error" ? (
          <div className="page-placeholder" aria-hidden="true">
            {renderState === "loading" ? "Chargement..." : ""}
          </div>
        ) : null}
        <canvas ref={canvasRef} className="pdf-canvas" />
      </div>
    </article>
  );
}

type PdfViewerProps = {
  document: OpenPdfDocument;
  onZoomChange: (documentId: string, delta: number) => void;
  onScrollPositionChange: (documentId: string, scrollLeft: number, scrollTop: number) => void;
  focusRequest: number;
};

function PdfViewer({ document, onZoomChange, onScrollPositionChange, focusRequest }: PdfViewerProps) {
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
    });
  }, [document.id, onScrollPositionChange]);

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
      tabIndex={0}
      className={isDragging ? "viewer viewer--pan-enabled is-panning" : "viewer viewer--pan-enabled"}
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
            scrollRootRef={viewerRef}
            registerPageRef={registerPageRef}
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

type OrganizePagesProps = {
  document: OpenPdfDocument;
  plan: OrganizePagePlan;
  selectedPageId: string | null;
  onToggleSelection: (pageId: string) => void;
  onMovePageByIndex: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onRotatePage: (pageId: string) => void;
  onReset: () => void;
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
  plan,
  selectedPageId,
  onToggleSelection,
  onMovePageByIndex,
  onDeletePage,
  onDuplicatePage,
  onRotatePage,
  onReset,
}: OrganizePagesProps) {
  const hasPendingChanges = isPlanModified(plan, document.pageCount);
  const canReset = hasPendingChanges || selectedPageId !== null;
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropPageId, setDropPageId] = useState<string | null>(null);

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
          <p>
            Modifications locales uniquement — elles seront exportables dans une prochaine étape.
          </p>
        </div>
        <div className="organize-header__actions">
          <span className={hasPendingChanges ? "organize-changes is-pending" : "organize-changes"}>
            {hasPendingChanges ? "Modifications en attente" : "Ordre d'origine"}
          </span>
          <button type="button" onClick={onReset} disabled={!canReset}>
            Réinitialiser l'organisation
          </button>
          <button type="button" disabled title="L'export PDF sera disponible prochainement.">
            Exporter — bientôt disponible
          </button>
        </div>
      </header>

      {plan.pages.length > 0 ? (
        <div className="organize-grid" aria-label="Grille des pages organisées">
          {plan.pages.map((page, index) => {
            const selected = page.id === selectedPageId;
            const pageLabel = `Page ${page.displayPageNumber}`;

            return (
              <article
                key={page.id}
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
                <OrganizePageThumbnail pdfDocument={document.pdfDocument} page={page} />
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
                  <span>Source : page {page.sourcePageIndex + 1}</span>
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
  theme,
  openFileInputRef,
  onSelectDocument,
  onCloseDocument,
  onToggleTheme,
  onClearLocalData,
  onFileChange,
  status,
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

          {documents.length > 0 ? (
            <ul className="document-list" aria-label="Liste des documents ouverts">
              {documents.map((document) => {
                const isActive = document.id === activeDocumentId;

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
                      tabIndex={isActive ? 0 : -1}
                      aria-label={`${document.fileName}${isActive ? ", document actif" : ""}`}
                      title={document.fileName}
                    >
                      <span className="document-title">{document.fileName}</span>
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
    </section>
  );
}

export function App() {
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
  const [organizationPlans, setOrganizationPlans] = useState<Record<string, OrganizePagePlan>>({});
  const [selectedPageIdsByDocument, setSelectedPageIdsByDocument] = useState<Record<string, string | null>>({});
  const [status, setStatus] = useState("Sélectionnez un PDF local.");
  const [viewerFocusRequest, setViewerFocusRequest] = useState(0);
  const nextOrganizedPageId = useRef(1);
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
      createInitialPagePlan(activeDocument.id, activeDocument.pageCount)
    );
  }, [activeDocument, organizationPlans]);
  const selectedOrganizedPageId = activeDocument
    ? (selectedPageIdsByDocument[activeDocument.id] ?? null)
    : null;

  useEffect(() => {
    if (documents.length === 0) {
      setWorkspaceMode("read");
    }
  }, [documents.length]);

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

      restoredDocuments.forEach((restoredDocument) => {
        const storedPlan = loadOrganizationPlan(restoredDocument.id);

        if (!storedPlan) {
          return;
        }

        if (!isValidPagePlanForDocument(storedPlan.plan, restoredDocument.id, restoredDocument.pageCount)) {
          removeOrganizationPlan(restoredDocument.id);
          return;
        }

        restoredPlans[restoredDocument.id] = storedPlan.plan;
        restoredSelectedPageIds[restoredDocument.id] = storedPlan.plan.pages.some(
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
      setStatus(
        failedCount > 0
          ? failedCount === 1
            ? "1 document n'a pas pu être restauré."
            : `${failedCount} documents n'ont pas pu être restaurés.`
          : "",
      );
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

    saveViewerPreferences({
      theme,
      sidebarVisible: isSidebarVisible,
      activeDocumentId,
      documentOrder: documents.map((document) => document.id),
    });
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

      void Promise.all(documents.map((document) => saveStoredDocument(buildViewerSnapshot(document))));
    }, 250);

    return () => {
      window.clearTimeout(saveTimeout);
    };
  }, [documents, isRestoringDocuments]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    Object.entries(organizationPlans).forEach(([documentId, plan]) => {
      if (!documents.some((document) => document.id === documentId)) {
        return;
      }

      saveOrganizationPlan(documentId, {
        plan,
        selectedPageId: selectedPageIdsByDocument[documentId] ?? null,
      });
    });
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

  const closeDocument = useCallback(
    (documentId: string) => {
      const closingIndex = documents.findIndex((document) => document.id === documentId);

      if (closingIndex < 0) {
        return;
      }

      const closingDocument = documents[closingIndex];
      const nextDocuments = documents.filter((document) => document.id !== documentId);
      const fallbackIndex = Math.min(closingIndex, nextDocuments.length - 1);
      const fallbackDocument = fallbackIndex >= 0 ? nextDocuments[fallbackIndex] : null;
      pendingFocusTargetRef.current = fallbackDocument?.id ?? "file-input";

      setDocuments(nextDocuments);
      setOrganizationPlans((currentPlans) => {
        const { [documentId]: _closedPlan, ...remainingPlans } = currentPlans;
        return remainingPlans;
      });
      setSelectedPageIdsByDocument((currentSelection) => {
        const { [documentId]: _closedSelection, ...remainingSelection } = currentSelection;
        return remainingSelection;
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
    [documents],
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
    setWorkspaceMode("read");
    setStatus("Sélectionnez un PDF local.");
    setIsSidebarVisible(true);
    setIsRestoringDocuments(false);
    setTheme(getSystemTheme());
    nextDocumentId.current = 1;
    documentButtonRefs.current.clear();
    void clearViewerStorage();
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
    (updatePlan: (plan: OrganizePagePlan) => OrganizePagePlan) => {
      if (!activeDocument) {
        return;
      }

      setOrganizationPlans((currentPlans) => {
        const currentPlan =
          currentPlans[activeDocument.id] ??
          createInitialPagePlan(activeDocument.id, activeDocument.pageCount);

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

      updateActiveOrganizationPlan((plan) => plan);
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

    setOrganizationPlans((currentPlans) => {
      const { [activeDocument.id]: _resetPlan, ...remainingPlans } = currentPlans;
      return remainingPlans;
    });
    setSelectedPageIdsByDocument((currentSelection) => {
      const { [activeDocument.id]: _resetSelection, ...remainingSelection } = currentSelection;
      return remainingSelection;
    });
    removeOrganizationPlan(activeDocument.id);
  }, [activeDocument]);

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

    setStatus(
      pdfFiles.length === 1 ? "Ouverture du PDF..." : `Ouverture de ${pdfFiles.length} PDF...`,
    );

    const openedDocuments: OpenPdfDocument[] = [];
    const failedFileNames: string[] = [];

    for (const file of pdfFiles) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdfDocument = await loadingTask.promise;
        const documentId = `pdf-${Date.now()}-${nextDocumentId.current}`;

        nextDocumentId.current += 1;
        openedDocuments.push({
          id: documentId,
          fileName: file.name,
          file,
          pdfDocument,
          loadingTask,
          pageCount: pdfDocument.numPages,
          zoom: 1,
          scrollLeft: 0,
          scrollTop: 0,
          error: null,
        });
      } catch {
        failedFileNames.push(file.name);
      }
    }

    if (openedDocuments.length > 0) {
      setDocuments((currentDocuments) => [...currentDocuments, ...openedDocuments]);
      setActiveDocumentId(openedDocuments[openedDocuments.length - 1].id);
      pendingFocusTargetRef.current = "viewer";
    }

    if (failedFileNames.length > 0) {
      setStatus(
        failedFileNames.length === 1
          ? `Impossible d'ouvrir ${failedFileNames[0]}.`
          : `${failedFileNames.length} PDF n'ont pas pu être ouverts.`,
      );
      return;
    }

    const ignoredFiles = selectedFiles.length - pdfFiles.length;
    setStatus(ignoredFiles > 0 ? `${ignoredFiles} fichier non PDF ignoré.` : "");
  }

  return (
    <main className="app-shell">
      <section className="toolbar toolbar--sticky" aria-label="Contrôles PDF">
        <div className="file-controls">
          <h1>PDF Editor MVP</h1>
        </div>

        <div className="document-meta" aria-live="polite">
          {activeDocument ? (
            <>
              <strong>{activeDocument.fileName}</strong>
              <span>
                {activeDocument.pageCount} page{activeDocument.pageCount > 1 ? "s" : ""}
              </span>
            </>
          ) : (
            <span>Aucun PDF sélectionné</span>
          )}
        </div>

        <div className="toolbar-actions" aria-label="Mode d'affichage">
          <button
            type="button"
            onClick={() => setWorkspaceMode((currentMode) => (currentMode === "read" ? "organize" : "read"))}
            aria-pressed={workspaceMode === "organize"}
          >
            {workspaceMode === "organize" ? "Revenir à la lecture" : "Organiser"}
          </button>
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
          >
            -
          </button>
          <span className="zoom-value">
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
          >
            +
          </button>
        </div>
      </section>

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
            theme={theme}
            openFileInputRef={openFileInputRef}
            onSelectDocument={selectDocumentFromSidebar}
            onCloseDocument={closeDocument}
            onToggleTheme={toggleTheme}
            onClearLocalData={clearLocalData}
            onFileChange={handleFileChange}
            status={status}
            sidebarId={sidebarId}
            onKeyDown={handleSidebarKeyDown}
            getDocumentButtonRef={(documentId) => (node) => {
              documentButtonRefs.current.set(documentId, node);
            }}
          />
        ) : null}

        {activeDocument && workspaceMode === "read" ? (
          <PdfViewer
            document={activeDocument}
            onZoomChange={updateDocumentZoom}
            onScrollPositionChange={updateDocumentScrollPosition}
            focusRequest={viewerFocusRequest}
          />
        ) : activeDocument && activeOrganizationPlan ? (
          <OrganizePages
            document={activeDocument}
            plan={activeOrganizationPlan}
            selectedPageId={selectedOrganizedPageId}
            onToggleSelection={toggleOrganizedPageSelection}
            onMovePageByIndex={moveOrganizedPage}
            onDeletePage={deleteOrganizedPage}
            onDuplicatePage={duplicateOrganizedPage}
            onRotatePage={rotateOrganizedPage}
            onReset={resetActiveOrganizationPlan}
          />
        ) : (
          <EmptyState status={status} mode={workspaceMode} />
        )}
      </section>
    </main>
  );
}

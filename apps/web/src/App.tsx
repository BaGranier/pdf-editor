import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
  loadStoredDocuments,
  loadViewerPreferences,
  removeStoredDocument,
  saveStoredDocument,
  saveViewerPreferences,
  type StoredPdfDocument,
  type ThemeMode,
  type ViewerDocumentSnapshot,
  type ViewerPreferences,
} from "./storage/viewerStorage";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const VIEWER_PAN_STEP = 56;

type RenderState = "idle" | "loading" | "ready" | "error";

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

type PdfPageCanvasProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  scrollRootRef: RefObject<HTMLElement | null>;
};

function PdfPageCanvas({ pdfDocument, pageNumber, zoom, scrollRootRef }: PdfPageCanvasProps) {
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
    <article ref={pageRef} className="pdf-page" aria-label={`Page ${pageNumber}`}>
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
};

function PdfViewer({ document, onZoomChange, onScrollPositionChange }: PdfViewerProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
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

      let nextScrollLeft = viewer.scrollLeft;
      let nextScrollTop = viewer.scrollTop;

      switch (event.key) {
        case "ArrowLeft":
          nextScrollLeft -= VIEWER_PAN_STEP;
          break;
        case "ArrowRight":
          nextScrollLeft += VIEWER_PAN_STEP;
          break;
        case "ArrowUp":
          nextScrollTop -= VIEWER_PAN_STEP;
          break;
        case "ArrowDown":
          nextScrollTop += VIEWER_PAN_STEP;
          break;
        default:
          return;
      }

      event.preventDefault();
      viewer.scrollLeft = nextScrollLeft;
      viewer.scrollTop = nextScrollTop;
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
    },
    [document.id, onScrollPositionChange],
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
          />
        ))}
      </div>
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
                      ref={getDocumentButtonRef(document.id)}
                      onClick={() => onSelectDocument(document.id)}
                      aria-current={isActive ? "true" : undefined}
                      aria-selected={isActive}
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
};

function EmptyState({ status }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label="Aucun PDF ouvert">
      <p className="status">{status}</p>
      <p>Le panneau de gauche listera vos documents ouverts.</p>
    </section>
  );
}

export function App() {
  const storedPreferences = useMemo(() => loadViewerPreferences(), []);
  const nextDocumentId = useRef(1);
  const documentsRef = useRef<OpenPdfDocument[]>([]);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const documentButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocusTargetRef = useRef<SidebarKeyTarget>(null);
  const sidebarId = "documents-sidebar";
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme(storedPreferences));
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => storedPreferences?.sidebarVisible ?? true);
  const [documents, setDocuments] = useState<OpenPdfDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState("Sélectionnez un PDF local.");
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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    if (pendingFocusTargetRef.current === null) {
      return;
    }

    const pendingFocusTarget = pendingFocusTargetRef.current;

    if (pendingFocusTarget === "file-input") {
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

      setDocuments(restoredDocuments);
      setActiveDocumentId(
        storedPreferences?.activeDocumentId &&
          restoredDocuments.some((document) => document.id === storedPreferences.activeDocumentId)
          ? storedPreferences.activeDocumentId
          : restoredDocuments[restoredDocuments.length - 1]?.id ?? null,
      );
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

  const closeActiveDocumentByKeyboard = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    closeDocument(activeDocument.id);
  }, [activeDocument, closeDocument]);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
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

      if (documents.length === 0) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        closeActiveDocumentByKeyboard();
        return;
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      event.preventDefault();

      const currentIndex = activeDocumentIndex < 0 ? 0 : activeDocumentIndex;
      const nextIndex =
        event.key === "ArrowDown"
          ? Math.min(currentIndex + 1, documents.length - 1)
          : Math.max(currentIndex - 1, 0);

      selectDocumentByKeyboard(nextIndex);
    },
    [activeDocumentIndex, closeActiveDocumentByKeyboard, documents.length, selectDocumentByKeyboard],
  );

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

        <div className="page-controls">
          <button
            type="button"
            onClick={() => {
              if (activeDocument) {
                updateDocumentZoom(activeDocument.id, -ZOOM_STEP);
              }
            }}
            disabled={!activeDocument || activeDocument.zoom <= MIN_ZOOM}
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
            disabled={!activeDocument || activeDocument.zoom >= MAX_ZOOM}
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
            onSelectDocument={setActiveDocumentId}
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

        {activeDocument ? (
          <PdfViewer
            document={activeDocument}
            onZoomChange={updateDocumentZoom}
            onScrollPositionChange={updateDocumentScrollPosition}
          />
        ) : (
          <EmptyState status={status} />
        )}
      </section>
    </main>
  );
}

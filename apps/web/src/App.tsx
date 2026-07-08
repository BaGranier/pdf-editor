import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

type RenderState = "idle" | "loading" | "ready" | "error";

type OpenPdfDocument = {
  id: string;
  fileName: string;
  file: File;
  pdfDocument: PDFDocumentProxy;
  loadingTask: PDFDocumentLoadingTask;
  pageCount: number;
  zoom: number;
  scrollTop: number;
  error: string | null;
};

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
  onScrollTopChange: (documentId: string, scrollTop: number) => void;
};

function PdfViewer({ document, onZoomChange, onScrollTopChange }: PdfViewerProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const pages = useMemo(
    () => Array.from({ length: document.pageCount }, (_, index) => index + 1),
    [document.pageCount],
  );

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.scrollTop = document.scrollTop;
  }, [document.id]);

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
        onScrollTopChange(document.id, viewer.scrollTop);
      }
    };
  }, [document.id, onScrollTopChange]);

  const handleScroll = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer || scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onScrollTopChange(document.id, viewer.scrollTop);
    });
  }, [document.id, onScrollTopChange]);

  return (
    <section
      ref={viewerRef}
      className="viewer"
      aria-label={`Aperçu PDF ${document.fileName}`}
      onScroll={handleScroll}
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

type TabsBarProps = {
  documents: OpenPdfDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
};

function TabsBar({
  documents,
  activeDocumentId,
  onSelectDocument,
  onCloseDocument,
}: TabsBarProps) {
  return (
    <nav className="tabs-bar" aria-label="Documents ouverts">
      <div className="tabs-list" role="tablist" aria-label="Documents PDF">
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId;

          return (
            <div key={document.id} className={isActive ? "tab is-active" : "tab"}>
              <button
                type="button"
                className="tab-select"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectDocument(document.id)}
                title={document.fileName}
              >
                <span className="tab-title">{document.fileName}</span>
              </button>
              <button
                type="button"
                className="tab-close"
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

type EmptyStateProps = {
  status: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

function EmptyState({ status, onFileChange }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label="Aucun PDF ouvert">
      <p className="status">{status}</p>
      <label className="file-picker empty-file-picker">
        <span>Ouvrir un PDF</span>
        <input type="file" accept="application/pdf,.pdf" multiple onChange={onFileChange} />
      </label>
    </section>
  );
}

export function App() {
  const nextDocumentId = useRef(1);
  const documentsRef = useRef<OpenPdfDocument[]>([]);
  const [documents, setDocuments] = useState<OpenPdfDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [status, setStatus] = useState("Sélectionnez un PDF local.");
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    return () => {
      documentsRef.current.forEach(releasePdfDocument);
    };
  }, []);

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

  const updateDocumentScrollTop = useCallback((documentId: string, scrollTop: number) => {
    setDocuments((currentDocuments) =>
      currentDocuments.map((document) => {
        if (document.id !== documentId || document.scrollTop === scrollTop) {
          return document;
        }

        return { ...document, scrollTop };
      }),
    );
  }, []);

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
    },
    [documents],
  );

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
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
          <label className="file-picker">
            <span>Ouvrir un PDF</span>
            <input type="file" accept="application/pdf,.pdf" multiple onChange={handleFileChange} />
          </label>
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

      {documents.length > 0 ? (
        <TabsBar
          documents={documents}
          activeDocumentId={activeDocumentId}
          onSelectDocument={setActiveDocumentId}
          onCloseDocument={closeDocument}
        />
      ) : null}

      {activeDocument ? (
        <PdfViewer
          document={activeDocument}
          onZoomChange={updateDocumentZoom}
          onScrollTopChange={updateDocumentScrollTop}
        />
      ) : (
        <EmptyState status={status} onFileChange={handleFileChange} />
      )}
    </main>
  );
}

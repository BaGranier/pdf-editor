import { useEffect, useRef, useState, type ChangeEvent } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.25;

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

export function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Sélectionnez un PDF local.");

  useEffect(() => {
    return () => {
      void pdfDocument?.cleanup();
    };
  }, [pdfDocument]);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      const canvas = canvasRef.current;

      if (!pdfDocument || !canvas) {
        return;
      }

      setStatus("Chargement de la page...");

      try {
        const page = await pdfDocument.getPage(currentPage);

        if (isCancelled) {
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
          setStatus("");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setStatus("Impossible d'afficher cette page PDF.");
        }
      }
    }

    void renderPage();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
    };
  }, [currentPage, pdfDocument, zoom]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Choisissez un fichier PDF.");
      return;
    }

    setStatus("Ouverture du PDF...");

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const loadedDocument = await pdfjsLib.getDocument({ data }).promise;

      setPdfDocument(loadedDocument);
      setFileName(file.name);
      setCurrentPage(1);
      setPageCount(loadedDocument.numPages);
      setZoom(1);
      setStatus("");
    } catch {
      setPdfDocument(null);
      setFileName("");
      setCurrentPage(1);
      setPageCount(0);
      clearCanvas(canvasRef.current);
      setStatus("Impossible d'ouvrir ce PDF.");
    }
  }

  const hasDocument = pdfDocument !== null;

  return (
    <main className="app-shell">
      <section className="toolbar" aria-label="Contrôles PDF">
        <div className="file-controls">
          <h1>PDF Editor MVP</h1>
          <label className="file-picker">
            <span>Ouvrir un PDF</span>
            <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
          </label>
        </div>

        <div className="document-meta" aria-live="polite">
          {fileName ? <strong>{fileName}</strong> : <span>Aucun PDF sélectionné</span>}
          {hasDocument ? (
            <span>
              Page {currentPage} / {pageCount}
            </span>
          ) : null}
        </div>

        <div className="page-controls">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={!hasDocument || currentPage <= 1}
          >
            Page précédente
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
            disabled={!hasDocument || currentPage >= pageCount}
          >
            Page suivante
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP))}
            disabled={!hasDocument || zoom <= MIN_ZOOM}
            aria-label="Réduire le zoom"
          >
            -
          </button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP))}
            disabled={!hasDocument || zoom >= MAX_ZOOM}
            aria-label="Augmenter le zoom"
          >
            +
          </button>
        </div>
      </section>

      <section className="viewer" aria-label="Aperçu PDF">
        {status ? <p className="status">{status}</p> : null}
        <canvas ref={canvasRef} className="pdf-canvas" />
      </section>
    </main>
  );
}

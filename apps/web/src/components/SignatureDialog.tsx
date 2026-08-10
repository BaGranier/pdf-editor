import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from "react";

export type SignatureImageDraft = {
  mimeType: "image/png" | "image/jpeg";
  dataUrl: string;
  width: number;
  height: number;
};

type SignatureDialogProps = {
  onCancel: () => void;
  onConfirm: (image: SignatureImageDraft) => void;
};

const DRAWING_WIDTH = 900;
const DRAWING_HEIGHT = 300;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;

function normalizedImageType(file: File): "image/png" | "image/jpeg" | null {
  if (file.type === "image/png") {
    return "image/png";
  }
  if (file.type === "image/jpeg") {
    return "image/jpeg";
  }
  if (file.type) {
    return null;
  }
  if (/\.png$/i.test(file.name)) {
    return "image/png";
  }
  if (/\.(?:jpe?g)$/i.test(file.name)) {
    return "image/jpeg";
  }
  return null;
}

export function SignatureDialog({ onCancel, onConfirm }: SignatureDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [mode, setMode] = useState<"draw" | "import">("draw");
  const [hasDrawing, setHasDrawing] = useState(false);
  const [importedImage, setImportedImage] =
    useState<SignatureImageDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * canvas.width,
      y: ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * canvas.height,
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }
    const context = event.currentTarget.getContext("2d");

    if (!context) {
      setError("La zone de dessin n'est pas disponible.");
      return;
    }

    const point = getCanvasPoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 7;
    context.strokeStyle = "#111111";
    drawingRef.current = true;
    setHasDrawing(true);
    setError(null);
  };

  const continueDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    const context = event.currentTarget.getContext("2d");

    if (!context) {
      return;
    }

    const point = getCanvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    event.currentTarget.getContext("2d")?.closePath();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    setHasDrawing(false);
    setError(null);
  };

  const importImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }
    const mimeType = normalizedImageType(file);
    if (!mimeType) {
      setError("Choisissez une image PNG ou JPEG.");
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setError("L'image de signature ne doit pas dépasser 5 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError("L'image de signature n'a pas pu être lue.");
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setError("L'image de signature n'a pas pu être lue.");
        return;
      }
      const dataUrl = reader.result;
      const image = new Image();
      image.onerror = () => setError("Le fichier image est invalide.");
      image.onload = () => {
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          setError("Le fichier image est invalide.");
          return;
        }
        setImportedImage({
          mimeType,
          dataUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        setError(null);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const confirm = () => {
    if (mode === "draw") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawing) {
        return;
      }
      onConfirm({
        mimeType: "image/png",
        dataUrl: canvas.toDataURL("image/png"),
        width: canvas.width,
        height: canvas.height,
      });
      return;
    }
    if (importedImage) {
      onConfirm(importedImage);
    }
  };

  const canConfirm = mode === "draw" ? hasDrawing : importedImage !== null;

  return (
    <div className="signature-dialog-backdrop" role="presentation">
      <section
        className="signature-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-dialog-title"
      >
        <header>
          <h2 id="signature-dialog-title">Ajouter une signature visuelle</h2>
          <p>
            La signature reste locale. Elle ne constitue pas une signature
            électronique ou cryptographique.
          </p>
        </header>
        <div className="signature-dialog__tabs" role="tablist" aria-label="Source de la signature">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "draw"}
            onClick={() => {
              setMode("draw");
              setError(null);
            }}
          >
            Dessiner
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "import"}
            onClick={() => {
              setMode("import");
              setError(null);
            }}
          >
            Importer
          </button>
        </div>
        <div className="signature-dialog__body">
          {mode === "draw" ? (
            <>
              <canvas
                ref={canvasRef}
                className="signature-drawing-canvas"
                width={DRAWING_WIDTH}
                height={DRAWING_HEIGHT}
                aria-label="Zone de dessin de la signature"
                onPointerDown={startDrawing}
                onPointerMove={continueDrawing}
                onPointerUp={stopDrawing}
                onPointerCancel={stopDrawing}
                onPointerLeave={stopDrawing}
              />
              <button type="button" onClick={clearDrawing} disabled={!hasDrawing}>
                Effacer et recommencer
              </button>
            </>
          ) : (
            <>
              <label className="signature-import-picker">
                Choisir une image PNG ou JPEG
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  aria-label="Importer une image de signature"
                  onChange={importImage}
                />
              </label>
              {importedImage ? (
                <img
                  className="signature-import-preview"
                  src={importedImage.dataUrl}
                  alt="Aperçu de la signature importée"
                />
              ) : null}
            </>
          )}
          {error ? <p className="signature-dialog__error" role="alert">{error}</p> : null}
          <p className="signature-dialog__warning">
            L'ajout d'une signature visuelle peut invalider ou altérer la
            validation cryptographique d'un PDF déjà signé numériquement.
          </p>
        </div>
        <footer>
          <button type="button" onClick={onCancel}>Annuler</button>
          <button type="button" onClick={confirm} disabled={!canConfirm}>
            Valider la signature
          </button>
        </footer>
      </section>
    </div>
  );
}

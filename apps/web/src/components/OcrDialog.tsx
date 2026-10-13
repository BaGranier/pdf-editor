import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { OcrLanguages, OcrOptions } from "../ocr/ocr";

type OcrDialogProps = {
  sourceFileName: string;
  hasPendingOrganizationChanges: boolean;
  isProcessing: boolean;
  onCancel: () => void;
  onSubmit: (options: OcrOptions) => void;
  supportsDeskew?: boolean;
};

export function OcrDialog({
  sourceFileName,
  hasPendingOrganizationChanges,
  isProcessing,
  onCancel,
  onSubmit,
  supportsDeskew = true,
}: OcrDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstControlRef = useRef<HTMLSelectElement | null>(null);
  const [languages, setLanguages] = useState<OcrLanguages>("fra");
  const [deskew, setDeskew] = useState(supportsDeskew);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);

  useEffect(() => {
    firstControlRef.current?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !isProcessing) {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isProcessing, onCancel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProcessing) {
      onSubmit({ languages, deskew, ...(rotation ? { rotation } : {}) });
    }
  }

  return (
    <div className="ocr-dialog-backdrop">
      <section
        className="ocr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="ocr-dialog__header">
          <div>
            <h2 id={titleId}>Reconnaissance de texte (OCR)</h2>
            <p id={descriptionId}>
              Créer un nouveau PDF consultable à partir de <strong>{sourceFileName}</strong>.
            </p>
          </div>
        </header>

        <form className="ocr-dialog__form" onSubmit={handleSubmit}>
          <label className="ocr-field" htmlFor={`${titleId}-languages`}>
            <span>Langue du document</span>
            <select
              ref={firstControlRef}
              id={`${titleId}-languages`}
              value={languages}
              disabled={isProcessing}
              onChange={(event) => setLanguages(event.target.value as OcrLanguages)}
            >
              <option value="fra">Français</option>
              <option value="eng">Anglais</option>
              <option value="fra+eng">Français et anglais</option>
            </select>
          </label>

          <div className="ocr-dialog__info">
            <p>L’OCR sera appliqué à toutes les pages du document.</p>
            <p>Le traitement de toutes les pages peut prendre plusieurs minutes.</p>
          </div>
          <label className="ocr-field">
            <span>Correction de rotation des scans</span>
            <select value={rotation} disabled={isProcessing} onChange={(event) => setRotation(Number(event.target.value) as 0 | 90 | 180 | 270)}>
              <option value={0}>Aucune</option>
              <option value={90}>90° sens horaire</option>
              <option value={180}>180°</option>
              <option value={270}>90° sens antihoraire</option>
            </select>
          </label>
          <p>La correction s’applique à toutes les pages source. La détection automatique d’orientation n’est pas disponible.</p>

          <label className="ocr-checkbox-field">
            <input
              type="checkbox"
              checked={deskew}
              disabled={isProcessing || !supportsDeskew}
              onChange={(event) => setDeskew(event.target.checked)}
            />
            <span>Redresser automatiquement les pages inclinées</span>
          </label>
          {!supportsDeskew ? <p role="note">Le redressement automatique des pages inclinées n’est pas disponible dans cette version desktop.</p> : null}

          {hasPendingOrganizationChanges ? (
            <p className="ocr-dialog__warning" role="note">
              L’OCR sera appliqué au PDF source. Les modifications d’organisation non
              exportées ne seront pas incluses.
            </p>
          ) : null}

          <footer className="ocr-dialog__actions">
            <button type="button" onClick={onCancel} disabled={isProcessing}>
              Annuler
            </button>
            <button
              type="submit"
              className="ocr-dialog__submit"
              disabled={isProcessing}
            >
              Lancer l’OCR
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { OcrLanguages, OcrOptions } from "../ocr/ocr";

type OcrDialogProps = {
  sourceFileName: string;
  hasPendingOrganizationChanges: boolean;
  isProcessing: boolean;
  onCancel: () => void;
  onSubmit: (options: OcrOptions) => void;
};

export function OcrDialog({
  sourceFileName,
  hasPendingOrganizationChanges,
  isProcessing,
  onCancel,
  onSubmit,
}: OcrDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstControlRef = useRef<HTMLSelectElement | null>(null);
  const [languages, setLanguages] = useState<OcrLanguages>("fra");
  const [deskew, setDeskew] = useState(true);

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
      onSubmit({ languages, deskew });
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

          <label className="ocr-checkbox-field">
            <input
              type="checkbox"
              checked={deskew}
              disabled={isProcessing}
              onChange={(event) => setDeskew(event.target.checked)}
            />
            <span>Redresser automatiquement les pages inclinées</span>
          </label>

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

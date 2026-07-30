import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type {
  ConversionImageDpi,
  ConversionDocxMode,
  ConversionLanguages,
  ConversionOcrMode,
  ConversionOptions,
  ConversionTarget,
} from "../conversion/conversion";
import {
  defaultConversionFilename,
  forceConversionFilenameExtension,
  validateConversionFilename,
} from "../conversion/conversion";

type ConversionDialogProps = {
  sourceFileName: string;
  sourcePageCount: number;
  hasPendingOrganizationChanges: boolean;
  isProcessing: boolean;
  onCancel: () => void;
  onSubmit: (options: ConversionOptions) => void;
};

const textTargets = new Set<ConversionTarget>(["docx", "txt", "html"]);

export function ConversionDialog({
  sourceFileName,
  sourcePageCount,
  hasPendingOrganizationChanges,
  isProcessing,
  onCancel,
  onSubmit,
}: ConversionDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const firstControlRef = useRef<HTMLSelectElement | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConversionTarget>("docx");
  const [languages, setLanguages] = useState<ConversionLanguages>("fra");
  const [ocrMode, setOcrMode] = useState<ConversionOcrMode>("auto");
  const [pages, setPages] = useState("");
  const [imageDpi, setImageDpi] = useState<ConversionImageDpi>(150);
  const [imageQuality, setImageQuality] = useState(85);
  const [docxMode, setDocxMode] = useState<ConversionDocxMode>("editable");
  const [outputFilename, setOutputFilename] = useState(() =>
    defaultConversionFilename(
      sourceFileName,
      "docx",
      "editable",
      "",
      sourcePageCount,
    ),
  );
  const filenameEditedRef = useRef(false);
  const isTextTarget = textTargets.has(targetFormat);
  const filenameError = validateConversionFilename(outputFilename);

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

  function updateSuggestedFilename(
    nextTarget: ConversionTarget,
    nextDocxMode: ConversionDocxMode,
    nextPages: string,
  ) {
    setOutputFilename((currentFilename) =>
      filenameEditedRef.current
        ? forceConversionFilenameExtension(
            currentFilename,
            nextTarget,
            nextPages,
            sourcePageCount,
          )
        : defaultConversionFilename(
            sourceFileName,
            nextTarget,
            nextDocxMode,
            nextPages,
            sourcePageCount,
          ),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isProcessing && !filenameError) {
      const normalizedOutputFilename = forceConversionFilenameExtension(
        outputFilename,
        targetFormat,
        pages,
        sourcePageCount,
      );
      setOutputFilename(normalizedOutputFilename);
      onSubmit({
        targetFormat,
        languages,
        ocrMode,
        pages,
        imageDpi,
        imageQuality,
        docxMode,
        outputFilename: normalizedOutputFilename,
      });
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
          <h2 id={titleId}>Convertir le PDF</h2>
          <p id={descriptionId}>
            Convertir localement <strong>{sourceFileName}</strong> sans modifier la source.
          </p>
        </header>

        <form className="ocr-dialog__form" onSubmit={handleSubmit}>
          <label className="ocr-field" htmlFor={`${titleId}-format`}>
            <span>Format de sortie</span>
            <select
              ref={firstControlRef}
              id={`${titleId}-format`}
              value={targetFormat}
              disabled={isProcessing}
              onChange={(event) => {
                const nextTarget = event.target.value as ConversionTarget;
                setTargetFormat(nextTarget);
                updateSuggestedFilename(nextTarget, docxMode, pages);
              }}
            >
              <option value="docx">Document Word (DOCX)</option>
              <option value="txt">Texte UTF-8 (TXT)</option>
              <option value="html">Page autonome (HTML)</option>
              <option value="png">Images PNG</option>
              <option value="jpeg">Images JPEG</option>
            </select>
          </label>

          {targetFormat === "docx" ? (
            <>
              <label className="ocr-field" htmlFor={`${titleId}-docx-mode`}>
                <span>Mode Word</span>
                <select
                  id={`${titleId}-docx-mode`}
                  value={docxMode}
                  disabled={isProcessing}
                  onChange={(event) => {
                    const nextMode = event.target.value as ConversionDocxMode;
                    setDocxMode(nextMode);
                    updateSuggestedFilename(targetFormat, nextMode, pages);
                  }}
                >
                  <option value="editable">Word éditable</option>
                  <option value="visual">Word fidèle visuellement</option>
                </select>
              </label>
              <p className="ocr-dialog__info">
                {docxMode === "editable"
                  ? "Produit un document modifiable. La mise en page peut être approximative."
                  : "Conserve l’apparence sous forme d’images. Le texte n’est pas facilement modifiable."}
              </p>
            </>
          ) : null}

          <label className="ocr-field" htmlFor={`${titleId}-pages`}>
            <span>Pages</span>
            <input
              id={`${titleId}-pages`}
              type="text"
              value={pages}
              placeholder="Toutes, ou par exemple 1-3,5"
              disabled={isProcessing}
              onChange={(event) => {
                const nextPages = event.target.value;
                setPages(nextPages);
                updateSuggestedFilename(targetFormat, docxMode, nextPages);
              }}
            />
          </label>

          <label className="ocr-field" htmlFor={`${titleId}-output-filename`}>
            <span>Nom du fichier</span>
            <input
              id={`${titleId}-output-filename`}
              type="text"
              value={outputFilename}
              disabled={isProcessing}
              aria-invalid={filenameError ? "true" : undefined}
              aria-describedby={
                filenameError ? `${titleId}-output-filename-error` : undefined
              }
              onChange={(event) => {
                filenameEditedRef.current = true;
                setOutputFilename(event.target.value);
              }}
              onBlur={() => {
                if (!filenameError) {
                  setOutputFilename(
                    forceConversionFilenameExtension(
                      outputFilename,
                      targetFormat,
                      pages,
                      sourcePageCount,
                    ),
                  );
                }
              }}
            />
          </label>
          {filenameError ? (
            <p
              id={`${titleId}-output-filename-error`}
              className="ocr-dialog__warning"
              role="alert"
            >
              {filenameError}
            </p>
          ) : null}

          {isTextTarget ? (
            <>
              <label className="ocr-field" htmlFor={`${titleId}-languages`}>
                <span>Langue OCR</span>
                <select
                  id={`${titleId}-languages`}
                  value={languages}
                  disabled={isProcessing}
                  onChange={(event) =>
                    setLanguages(event.target.value as ConversionLanguages)
                  }
                >
                  <option value="fra">Français</option>
                  <option value="eng">Anglais</option>
                  <option value="fra+eng">Français et anglais</option>
                </select>
              </label>
              <label className="ocr-field" htmlFor={`${titleId}-ocr-mode`}>
                <span>Reconnaissance OCR</span>
                <select
                  id={`${titleId}-ocr-mode`}
                  value={ocrMode}
                  disabled={isProcessing}
                  onChange={(event) =>
                    setOcrMode(event.target.value as ConversionOcrMode)
                  }
                >
                  <option value="auto">Automatique</option>
                  <option value="never">Jamais</option>
                  <option value="always">Toujours</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="ocr-field" htmlFor={`${titleId}-dpi`}>
                <span>Résolution</span>
                <select
                  id={`${titleId}-dpi`}
                  value={imageDpi}
                  disabled={isProcessing}
                  onChange={(event) =>
                    setImageDpi(Number(event.target.value) as ConversionImageDpi)
                  }
                >
                  <option value={96}>96 dpi</option>
                  <option value={150}>150 dpi</option>
                  <option value={300}>300 dpi</option>
                </select>
              </label>
              {targetFormat === "jpeg" ? (
                <label className="ocr-field" htmlFor={`${titleId}-quality`}>
                  <span>Qualité JPEG : {imageQuality}%</span>
                  <input
                    id={`${titleId}-quality`}
                    type="range"
                    min={1}
                    max={100}
                    value={imageQuality}
                    disabled={isProcessing}
                    onChange={(event) => setImageQuality(Number(event.target.value))}
                  />
                </label>
              ) : null}
            </>
          )}

          {targetFormat === "docx" && docxMode === "editable" ? (
            <p className="ocr-dialog__warning" role="note">
              La conversion tente de conserver la mise en page, mais certains éléments
              complexes peuvent être réorganisés.
            </p>
          ) : targetFormat === "docx" ? (
            <p className="ocr-dialog__warning" role="note">
              Chaque page sera conservée comme une image dans le document Word.
            </p>
          ) : null}

          {hasPendingOrganizationChanges ? (
            <p className="ocr-dialog__warning" role="note">
              La conversion utilise le PDF source. Les modifications d’organisation non
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
              disabled={isProcessing || Boolean(filenameError)}
            >
              Lancer la conversion
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

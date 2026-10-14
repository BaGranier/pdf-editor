import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { normalizePdfFileName } from "../saving/fileName";

type SaveAsDialogProps = {
  suggestedName: string;
  isSaving: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSave: (fileName: string) => Promise<boolean>;
};

export function SaveAsDialog({
  suggestedName,
  isSaving,
  errorMessage,
  onCancel,
  onSave,
}: SaveAsDialogProps) {
  const titleId = useId();
  const triggerRef = useRef(document.activeElement as HTMLElement | null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    nameRef.current?.focus();
    return () => { triggerRef.current?.focus({ preventScroll: true }); };
  }, []);
  const errorId = useId();
  const [fileName, setFileName] = useState(suggestedName);
  const [validationError, setValidationError] = useState<string | null>(null);
  const displayedError = validationError ?? errorMessage;

  useEffect(() => {
    setFileName(suggestedName);
    setValidationError(null);
  }, [suggestedName]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePdfFileName(fileName);

    if (!normalized.fileName) {
      setValidationError(normalized.error);
      return;
    }

    setFileName(normalized.fileName);
    setValidationError(null);
    await onSave(normalized.fileName);
  }

  return (
    <div className="unsaved-dialog-backdrop" role="presentation">
      <form
        className="unsaved-dialog save-as-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => void handleSubmit(event)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape" && !isSaving) { event.preventDefault(); onCancel(); }
          if (event.key === "Tab") {
            const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)")];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}
      >
        <h2 id={titleId}>Enregistrer sous</h2>
        <label htmlFor={`${titleId}-file-name`}>Nom du fichier</label>
        <input
          id={`${titleId}-file-name`}
          ref={nameRef}
          type="text"
          value={fileName}
          onChange={(event) => {
            setFileName(event.currentTarget.value);
            setValidationError(null);
          }}
          aria-describedby={displayedError ? errorId : undefined}
          aria-invalid={displayedError ? "true" : undefined}
          autoFocus
          disabled={isSaving}
        />
        {displayedError ? (
          <p id={errorId} className="save-as-dialog__error" role="alert">
            {displayedError}
          </p>
        ) : null}
        <div className="unsaved-dialog__actions">
          <button type="button" onClick={onCancel} disabled={isSaving}>
            Annuler
          </button>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

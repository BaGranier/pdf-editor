import { useEffect, useRef, useState } from "react";

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      {locked ? <path d="M8 10V7a4 4 0 0 1 8 0v3" /> : <path d="M8 10V7a4 4 0 0 1 7.4-2" />}
      <path d="M12 14v2" />
    </svg>
  );
}

export function FormLockToolbar({
  uiLocked,
  pdfLocked,
  onSetUiLocked,
  onRequestPdfLock,
  onUnlockPdf,
}: {
  uiLocked: boolean;
  pdfLocked: boolean;
  onSetUiLocked: (locked: boolean) => void;
  onRequestPdfLock: () => void;
  onUnlockPdf: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const effectiveLocked = uiLocked || pdfLocked;
  const stateLabel = pdfLocked
    ? "Formulaire verrouillé dans le PDF"
    : effectiveLocked
      ? "Formulaire verrouillé"
      : "Formulaire modifiable";

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const selectUiMode = (locked: boolean) => {
    if (pdfLocked) return;
    onSetUiLocked(locked);
    setIsOpen(false);
  };

  return (
    <section ref={rootRef} className="pdf-form-lock-toolbar" aria-label="Contrôle du formulaire">
      <button
        type="button"
        className="pdf-form-lock-control"
        data-lock-icon={effectiveLocked ? "closed" : "open"}
        aria-label={stateLabel}
        aria-pressed={effectiveLocked}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={stateLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <LockIcon locked={effectiveLocked} />
      </button>
      {isOpen ? (
        <div className="pdf-form-lock-popover" role="dialog" aria-label="Mode d’édition du formulaire">
          <strong>Formulaire</strong>
          <p>{stateLabel}.</p>
          <div role="radiogroup" aria-label="État de l’édition">
            <button type="button" role="radio" aria-checked={!effectiveLocked} disabled={pdfLocked} onClick={() => selectUiMode(false)}>
              <LockIcon locked={false} />
              <span><b>Autoriser l’édition</b><small>Les champs peuvent être modifiés.</small></span>
            </button>
            <button type="button" role="radio" aria-checked={effectiveLocked} disabled={pdfLocked} onClick={() => selectUiMode(true)}>
              <LockIcon locked />
              <span><b>Verrouiller</b><small>Empêche les modifications accidentelles dans l’application.</small></span>
            </button>
          </div>
          <div className="pdf-form-lock-popover__persistent">
            {pdfLocked ? (
              <button type="button" onClick={() => { onUnlockPdf(); setIsOpen(false); }}>Déverrouiller le PDF</button>
            ) : (
              <button type="button" onClick={() => { onRequestPdfLock(); setIsOpen(false); }}>Verrouiller dans le PDF…</button>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

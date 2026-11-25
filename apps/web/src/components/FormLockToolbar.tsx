import { useLocale } from "../viewer/locale";
import { useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { floatingPortalTarget, useFloatingPosition } from "../hooks/useFloatingPosition";
import { usePopoverDismiss } from "../hooks/usePopoverDismiss";

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
  const { t: localize } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const effectiveLocked = uiLocked || pdfLocked;
  const stateLabel = pdfLocked
    ? "Formulaire verrouillé dans le PDF"
    : effectiveLocked
      ? "Formulaire verrouillé"
      : "Formulaire modifiable";

  const panelId = useId();
  useFloatingPosition(isOpen, triggerRef, popoverRef, "bottom-end", setIsOpen);
  usePopoverDismiss(isOpen, triggerRef, popoverRef, setIsOpen);
  useLayoutEffect(() => {
    if (isOpen) popoverRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [isOpen]);

  const selectUiMode = (locked: boolean) => {
    if (pdfLocked) return;
    onSetUiLocked(locked);
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <section className="pdf-form-lock-toolbar" aria-label={localize("Contrôle du formulaire")}>
      <button
        type="button"
        ref={triggerRef}
        className="pdf-form-lock-control"
        data-lock-icon={effectiveLocked ? "closed" : "open"}
        aria-label={stateLabel}
        aria-pressed={effectiveLocked}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        title={stateLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <LockIcon locked={effectiveLocked} />
      </button>
      {isOpen ? createPortal(
        <div ref={popoverRef} id={panelId} className="floating-surface pdf-form-lock-popover" role="dialog" aria-label={localize("Mode d’édition du formulaire")}>
          <strong>{localize("Formulaire")}</strong>
          <p>{stateLabel}.</p>
          <div role="radiogroup" aria-label={localize("État de l’édition")}>
            <button type="button" role="radio" aria-checked={!effectiveLocked} disabled={pdfLocked} onClick={() => selectUiMode(false)}>
              <LockIcon locked={false} />
              <span><b>{localize("Autoriser l’édition")}</b><small>{localize("Les champs peuvent être modifiés.")}</small></span>
            </button>
            <button type="button" role="radio" aria-checked={effectiveLocked} disabled={pdfLocked} onClick={() => selectUiMode(true)}>
              <LockIcon locked />
              <span><b>{localize("Verrouiller")}</b><small>{localize("Empêche les modifications accidentelles dans l’application.")}</small></span>
            </button>
          </div>
          <div className="pdf-form-lock-popover__persistent">
            {pdfLocked ? (
              <button type="button" onClick={() => { onUnlockPdf(); setIsOpen(false); }}>{localize("Déverrouiller le PDF")}</button>
            ) : (
              <button type="button" onClick={() => { onRequestPdfLock(); setIsOpen(false); }}>{localize("Verrouiller le PDF pour l'export")}</button>
            )}
          </div>
        </div>,
        floatingPortalTarget(triggerRef.current),
      ) : null}
    </section>
  );
}

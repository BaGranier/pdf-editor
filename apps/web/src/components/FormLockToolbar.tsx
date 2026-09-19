export function FormLockToolbar({
  uiLocked,
  pdfLocked,
  onToggleUiLock,
  onRequestPdfLock,
  onUnlockPdf,
}: {
  uiLocked: boolean;
  pdfLocked: boolean;
  onToggleUiLock: () => void;
  onRequestPdfLock: () => void;
  onUnlockPdf: () => void;
}) {
  return (
    <section className="pdf-form-lock-toolbar" aria-label="Options du formulaire">
      <button
        type="button"
        aria-pressed={uiLocked}
        title="Empêche les modifications dans PDF Studio Local sans modifier le fichier."
        onClick={onToggleUiLock}
      >
        {uiLocked ? "Autoriser l’édition" : "Verrouiller l’édition"}
      </button>
      {pdfLocked ? (
        <>
          <span role="status">🔒 Formulaire verrouillé</span>
          <button type="button" onClick={onUnlockPdf}>Déverrouiller le formulaire</button>
        </>
      ) : (
        <button type="button" onClick={onRequestPdfLock}>Verrouiller le formulaire</button>
      )}
    </section>
  );
}

import { useLocale } from "../viewer/locale";
import { useEffect, useId, useState } from "react";

export type PrintPreviewStage = "preparing" | "ready" | "dialog-requested";

export function PrintPreviewDialog({
  documentName,
  pdfBlob,
  stage,
  onCancel,
  onPrint,
  onOpenPdf,
}: {
  documentName: string;
  pdfBlob: Blob | null;
  stage: PrintPreviewStage;
  onCancel: () => void;
  onPrint: () => void;
  onOpenPdf: () => boolean;
}) {
  const { t: localize } = useLocale();
  const titleId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfBlob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pdfBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdfBlob]);

  const preparing = stage === "preparing";
  const dialogRequested = stage === "dialog-requested";

  return (
    <div className="unsaved-dialog-backdrop print-preview-backdrop" role="presentation">
      <section className="unsaved-dialog print-preview-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <h2 id={titleId}>{localize("Aperçu avant impression")}</h2>
          <p>{preparing ? localize("Préparation de l’impression…") : localize("Document à imprimer : {0}", documentName)}</p>
          <p role="note"><strong>{localize("Impression intégrée — Expérimental")}</strong><br />{localize("Selon votre environnement, le dialogue d’impression peut ne pas s’ouvrir. Enregistrez ou exportez le PDF, puis imprimez-le depuis votre lecteur PDF externe.")}</p>
        </header>
        {previewUrl ? (
          <iframe className="print-preview-dialog__document" title={localize("Aperçu du PDF à imprimer")} src={previewUrl} />
        ) : (
          <div className="print-preview-dialog__loading" role="status">
            <span className="organize-spinner" aria-hidden="true" />
            {localize("Préparation de l’impression…")}
          </div>
        )}
        {dialogRequested ? (
          <p className="print-preview-dialog__hint" role="status">
            {localize("Le dialogue d’impression a été demandé. S’il ne s’ouvre pas, réessayez ou ouvrez le PDF à imprimer.")}
          </p>
        ) : null}
        {fallbackMessage ? <p className="print-preview-dialog__error" role="alert">{fallbackMessage}</p> : null}
        <div className="unsaved-dialog__actions">
          <button type="button" onClick={onCancel}>{localize("Annuler")}</button>
          <button
            type="button"
            onClick={() => setFallbackMessage(onOpenPdf() ? "Le PDF imprimable a été ouvert à votre demande." : "Le navigateur a bloqué l’ouverture du PDF. Autorisez les fenêtres pour réessayer.")}
            disabled={!pdfBlob}
          >
            {localize("Ouvrir le PDF à imprimer")}
          </button>
          <button type="button" onClick={onPrint} disabled={!pdfBlob || dialogRequested}>
            {dialogRequested ? localize("Dialogue demandé…") : localize("Imprimer")}
          </button>
        </div>
      </section>
    </div>
  );
}

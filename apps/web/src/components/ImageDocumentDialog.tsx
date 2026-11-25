import { useLocale } from "../viewer/locale";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ImageCropEditor } from "./ImageCropEditor";
import type { ImageTransform } from "../images/imageDocument";

export function ImageDocumentDialog({ pdf, onTransform, onReset, onCancel }: {
  pdf: PDFDocumentProxy; onTransform: (transform: ImageTransform) => void;
  onReset: () => void; onCancel: () => void;
}) {
  const { t: localize } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState("free"), [size, setSize] = useState({ width: 400, height: 300 });
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false, task: RenderTask | undefined;
    void pdf.getPage(1).then(async (page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(480 / base.width, 320 / base.height) });
      setSize({ width: viewport.width, height: viewport.height });
      const target = canvas.current; target.width = Math.ceil(viewport.width); target.height = Math.ceil(viewport.height);
      const context = target.getContext("2d");
      if (!context) throw new Error("Aperçu indisponible.");
      task = page.render({ canvas: target, canvasContext: context, viewport });
      await task.promise;
      if (!cancelled) setReady(true);
    }).catch(() => { if (!cancelled) setError("Aperçu indisponible."); });
    const trigger = document.activeElement as HTMLElement | null;
    return () => { cancelled = true; task?.cancel(); trigger?.focus(); };
  }, [pdf]);
  const targetRatio = ratio === "square" ? 1 : ratio === "photo" ? 4 / 3 : size.width / size.height;
  const width = Math.min(1, targetRatio / (size.width / size.height));
  const height = Math.min(1, (size.width / size.height) / targetRatio);
  return <div className="unsaved-dialog-backdrop" role="presentation"><section className="unsaved-dialog images-pdf-dialog" role="dialog" aria-modal="true" aria-label={localize("Éditer le fond image")}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      if (event.key === "Tab") {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), select, [tabindex='0']"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        const edge = event.shiftKey ? first : last;
        if (document.activeElement === edge) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    }}>
    <h2>{localize("Éditer le fond image")}</h2>
    <p>{localize("Transformations non destructives du fond, ajusté dans la page d’origine. Les annotations gardent leur position sur la page. Le rognage est visuel et ne supprime pas les données cachées.")}</p>
    <div className="image-document-preview" style={{ width: size.width }}>
      <canvas ref={canvas} style={{ width: "100%", aspectRatio: size.width / size.height }} aria-label={localize("Aperçu du fond image")} />
      {ready ? <ImageCropEditor inlineActions key={ratio} initial={{ x: (1 - width) / 2, y: (1 - height) / 2, width, height }} onApply={(crop) => onTransform({ type: "crop", ...crop })} onCancel={onCancel} /> : null}
    </div>
    <label>{localize("Ratio du cadre initial")}<select value={ratio} onChange={(event) => setRatio(event.currentTarget.value)}><option value="free">{localize("Libre")}</option><option value="square">{localize("Carré (1:1)")}</option><option value="photo">Photo (4:3)</option></select></label>
    {error ? <p role="alert">{localize(error)}</p> : null}
    <div className="unsaved-dialog__actions">
      <button type="button" onClick={() => onTransform({ type: "rotate" })} disabled={!ready}>{localize("Pivoter le fond de 90°")}</button>
      <button type="button" onClick={() => onTransform({ type: "mirror_horizontal" })} disabled={!ready}>{localize("Retourner horizontalement")}</button>
      <button type="button" onClick={() => onTransform({ type: "mirror_vertical" })} disabled={!ready}>{localize("Retourner verticalement")}</button>
      <button type="button" onClick={onReset}>{localize("Réinitialiser le fond")}</button><button type="button" onClick={onCancel}>{localize("Fermer")}</button>
    </div>
  </section></div>;
}

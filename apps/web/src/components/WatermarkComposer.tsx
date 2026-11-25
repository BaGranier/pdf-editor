import { useLocale } from "../viewer/locale";
import { isEditableKeyboardTarget } from "../commands/appShortcuts";
import { WatermarkPatternControls } from "./WatermarkPatternControls";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_WATERMARK, WATERMARK_PRESETS, type WatermarkDraft } from "../editing/watermarks";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

export function WatermarkComposer({ onPreview, onApply, onClear, onCancel, previewReady, currentPage }: { onPreview: (draft: WatermarkDraft, page?: number) => Promise<void>; onApply: () => void; onClear: () => void; onCancel: () => void; previewReady: boolean; currentPage: number }) {
  const { t: localize } = useLocale();
  const [draft, setDraft] = useState(DEFAULT_WATERMARK), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const preset = WATERMARK_PRESETS.find((text) => draft.text === text || draft.text === localize(text));
  const scopedPage = draft.scope === "page" ? currentPage : undefined;
  const previewRequest = useRef(0);
  const update = (patch: Partial<WatermarkDraft>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); onClear(); };
  useEffect(() => {
    onClear();
    const request = ++previewRequest.current;
    const timeout = window.setTimeout(() => {
      if (request !== previewRequest.current) return;
      void onPreview(draft, scopedPage).then(() => { if (request === previewRequest.current) setError(""); }).catch((error: unknown) => { if (request === previewRequest.current) { onClear(); setError(error instanceof Error ? error.message : "Aperçu impossible."); } });
    }, 150);
    return () => { previewRequest.current++; window.clearTimeout(timeout); onClear(); };
  }, [draft, scopedPage, onPreview, onClear]);
  return <section className="shape-edit-toolbar" aria-label={localize("Créer un filigrane")} onKeyDown={(event) => { if (event.key === "Escape" && !isEditableKeyboardTarget(event.target)) { event.stopPropagation(); onCancel(); } }}>
    <strong>{localize("Filigrane · Aperçu non enregistré")}</strong>
    <p>{localize("Marquage visuel non destructif : les informations d’origine restent récupérables.")}</p>
    <WatermarkPatternControls value={{ watermarkMode: draft.mode, tile: draft.tile, fontSize: draft.fontSize ?? 18, color: draft.color }} onChange={(patch) => update({ ...(patch.watermarkMode ? { mode: patch.watermarkMode, ...(patch.watermarkMode === "tiled" ? { rotation: -30 } : {}) } : {}), ...(patch.tile ? { tile: patch.tile } : {}), ...(patch.fontSize !== undefined ? { fontSize: patch.fontSize } : {}) })} onFinish={() => undefined} />
    <p>{localize("Polices embarquées ; caractères Latin-1 uniquement (sans € ni Œ).")}</p>
    <label>{localize("Prédéfini")}<select aria-label={localize("Filigrane prédéfini")} value={preset ?? "custom"} onChange={(event) => update({ text: event.target.value === "custom" ? "" : localize(event.target.value) })}>{WATERMARK_PRESETS.map((text) => <option key={text} value={text}>{localize(text)}</option>)}<option value="custom">{localize("Texte libre")}</option></select></label>
    <label>{localize("Texte du filigrane")}<textarea aria-label={localize("Texte du filigrane")} maxLength={200} value={draft.text} onChange={(event) => update({ text: event.target.value })} /></label>
    <ColorPicker label={localize("Couleur du filigrane")} value={draft.color} onChange={(color) => update({ color })} />
    <PropertySlider label={localize("Opacité du filigrane")} value={draft.opacity * 100} min={0} max={100} step={1} unit="%" color={draft.color} previewLabel={localize("Opacité")} onChange={(value) => update({ opacity: value / 100 })} onCommit={() => undefined} />
    <PropertySlider signed label={localize("Rotation du filigrane")} value={draft.rotation} min={-180} max={180} step={1} unit="°" color={draft.color} previewLabel="Rotation" onChange={(rotation) => update({ rotation })} onCommit={() => undefined} />
    <label>{localize("Pages du filigrane")}<select aria-label={localize("Pages du filigrane")} value={draft.scope} onChange={(event) => update({ scope: event.target.value as WatermarkDraft["scope"] })}><option value="page">{localize("Page actuelle")}</option><option value="all">{localize("Toutes les pages")}</option><option value="range">{localize("Plage de pages")}</option></select></label>
    {draft.scope === "range" ? <label>{localize("Plage")}<input aria-label={localize("Plage du filigrane")} placeholder="1-3, 5, 8-10" value={draft.range} onChange={(event) => update({ range: event.target.value })} /></label> : null}
    <button type="button" disabled={busy || !draft.text.trim()} onClick={async () => { setBusy(true); setError(""); try { previewRequest.current++; await onPreview(draft, scopedPage); } catch (error) { setError(error instanceof Error ? error.message : "Aperçu impossible."); } finally { setBusy(false); } }}>{localize("Prévisualiser le filigrane")}</button>
    <button type="button" disabled={busy || !previewReady} onClick={onApply}>{localize("Valider le filigrane")}</button>
    <button type="button" onClick={onCancel}>{localize("Annuler le filigrane")}</button>
    {error ? <p role="alert">{localize(error)}</p> : null}
    <p>{localize("Les polices, taille/échelle et décalages sont modifiables dans l’inspecteur après insertion. Les changements d’un groupe concernent toutes ses pages.")}</p>
  </section>;
}

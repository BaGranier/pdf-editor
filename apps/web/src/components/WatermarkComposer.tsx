import { useState } from "react";
import { DEFAULT_WATERMARK, WATERMARK_PRESETS, type WatermarkDraft } from "../editing/watermarks";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

export function WatermarkComposer({ onPreview, onApply, onClear, onCancel, previewReady }: { onPreview: (draft: WatermarkDraft) => Promise<void>; onApply: () => void; onClear: () => void; onCancel: () => void; previewReady: boolean }) {
  const [draft, setDraft] = useState(DEFAULT_WATERMARK), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const update = (patch: Partial<WatermarkDraft>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); onClear(); };
  return <section className="shape-edit-toolbar" aria-label="Créer un filigrane" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
    <strong>Filigrane · Aperçu non enregistré</strong>
    <p>Marquage visuel non destructif : les informations d’origine restent récupérables.</p>
    <label>Prédéfini<select aria-label="Filigrane prédéfini" value={WATERMARK_PRESETS.includes(draft.text as typeof WATERMARK_PRESETS[number]) ? draft.text : "custom"} onChange={(event) => update({ text: event.target.value === "custom" ? "" : event.target.value })}>{WATERMARK_PRESETS.map((text) => <option key={text}>{text}</option>)}<option value="custom">Texte libre</option></select></label>
    <label>Texte du filigrane<textarea aria-label="Texte du filigrane" maxLength={200} value={draft.text} onChange={(event) => update({ text: event.target.value })} /></label>
    <ColorPicker label="Couleur du filigrane" value={draft.color} onChange={(color) => update({ color })} />
    <PropertySlider label="Opacité du filigrane" value={draft.opacity * 100} min={0} max={100} step={1} unit="%" color={draft.color} previewLabel="Opacité" onChange={(value) => update({ opacity: value / 100 })} onCommit={() => undefined} />
    <PropertySlider label="Rotation du filigrane" value={draft.rotation} min={-180} max={180} step={1} unit="°" color={draft.color} previewLabel="Rotation" onChange={(rotation) => update({ rotation })} onCommit={() => undefined} />
    <label>Pages du filigrane<select aria-label="Pages du filigrane" value={draft.scope} onChange={(event) => update({ scope: event.target.value as WatermarkDraft["scope"] })}><option value="page">Page actuelle</option><option value="all">Toutes les pages</option><option value="range">Plage de pages</option></select></label>
    {draft.scope === "range" ? <label>Plage<input aria-label="Plage du filigrane" placeholder="1-3, 5, 8-10" value={draft.range} onChange={(event) => update({ range: event.target.value })} /></label> : null}
    <button type="button" disabled={busy || !draft.text.trim()} onClick={async () => { setBusy(true); setError(""); try { await onPreview(draft); } catch (error) { setError(error instanceof Error ? error.message : "Aperçu impossible."); } finally { setBusy(false); } }}>Prévisualiser le filigrane</button>
    <button type="button" disabled={busy || !previewReady} onClick={onApply}>Appliquer le filigrane</button>
    <button type="button" onClick={onCancel}>Annuler le filigrane</button>
    {error ? <p role="alert">{error}</p> : null}
    <p>Les polices, taille/échelle et décalages sont modifiables dans l’inspecteur après insertion. Les changements d’un groupe concernent toutes ses pages.</p>
  </section>;
}

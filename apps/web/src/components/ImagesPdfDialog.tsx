import { useLocale } from "../viewer/locale";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_IMAGE_LAYOUT, readImageSource, type ImageLayout, type ImageSource } from "../images/imageDocument";

type Entry = { id: number; name: string; source: ImageSource; url: string };
export function ImagesPdfDialog({ onCancel, onCreate }: {
  onCancel: () => void;
  onCreate: (sources: ImageSource[], layout: ImageLayout, signal: AbortSignal) => Promise<void>;
}) {
  const { t: localize } = useLocale();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [layout, setLayout] = useState<ImageLayout>({ ...DEFAULT_IMAGE_LAYOUT, pageSize: "a4", margin: 24 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entriesRef = useRef(entries), counter = useRef(0), dragged = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    const trigger = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => { mounted.current = false; controller.current?.abort(); entriesRef.current.forEach((entry) => URL.revokeObjectURL(entry.url)); trigger?.focus(); };
  }, []);
  function replace(next: Entry[]) { entriesRef.current = next; setEntries(next); }
  async function add(files: File[]) {
    setBusy(true); setError(null);
    const added: Entry[] = [];
    try {
      let bytes = entriesRef.current.reduce((n, entry) => n + entry.source.original.size, 0);
      let pixels = entriesRef.current.reduce((n, entry) => n + entry.source.widthPx * entry.source.heightPx, 0);
      if (entriesRef.current.length + files.length > 250) throw new Error("250 images maximum.");
      for (const file of files) {
        bytes += file.size;
        if (bytes > 192 * 1024 * 1024) throw new Error("192 Mio compressés maximum par conversion.");
        const source = await readImageSource(file);
        pixels += source.widthPx * source.heightPx;
        if (pixels > 128_000_000) throw new Error("128 millions de pixels maximum par conversion.");
        if (!mounted.current) return;
        added.push({ id: counter.current++, name: file.name, source, url: URL.createObjectURL(new Blob([file], { type: source.mimeType })) });
      }
      replace([...entriesRef.current, ...added]);
    } catch (cause) { added.forEach((entry) => URL.revokeObjectURL(entry.url)); if (mounted.current) setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { if (mounted.current) setBusy(false); else added.forEach((entry) => URL.revokeObjectURL(entry.url)); }
  }
  function move(from: number, to: number) {
    if (busy || from === to || to < 0 || to >= entries.length) return;
    const next = [...entries]; next.splice(to, 0, next.splice(from, 1)[0]); replace(next);
  }
  function cancel() { controller.current?.abort(); onCancel(); }
  return <div className="unsaved-dialog-backdrop" role="presentation"><form className="unsaved-dialog images-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="images-pdf-title"
    onSubmit={(event) => { event.preventDefault(); if (busy || !entries.length) return; const request = new AbortController(); controller.current = request; setBusy(true); setError(null); void onCreate(entries.map((entry) => entry.source), layout, request.signal).catch((cause: unknown) => { if (mounted.current && !request.signal.aborted) setError(cause instanceof Error ? cause.message : "Conversion impossible."); }).finally(() => { if (mounted.current) setBusy(false); }); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); cancel(); }
      if (event.key === "Tab") {
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("input:not(:disabled),select:not(:disabled),button:not(:disabled)")];
        const firstControl = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === firstControl) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstControl?.focus(); }
      }
    }}>
    <h2 id="images-pdf-title">{localize("Nouveau PDF à partir d’images")}</h2>
    <p>{localize("PNG, JPEG ou WebP statique. Le PDF sera ouvert dans un nouvel onglet ; les originaux sont conservés. Les pixels ne deviennent pas du texte éditable.")}</p>
    <label>{localize("Ajouter des images")}<input ref={first} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple disabled={busy} onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void add(files); }} /></label>
    <ol className="images-pdf-list" aria-label={localize("Ordre des images")}>{entries.map((entry, index) => <li key={entry.id} draggable={!busy}
      onDragStart={(event) => { dragged.current = entry.id; event.dataTransfer.setData("text/plain", String(entry.id)); }}
      onDragEnd={() => { dragged.current = null; }} onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const from = entries.findIndex((item) => item.id === dragged.current); if (from >= 0) move(from, index); dragged.current = null; }}>
      <img src={entry.url} alt="" width="64" height="64" /><span>{entry.name} · {entry.source.widthPx} × {entry.source.heightPx} px</span>
      <button type="button" aria-label={localize("Monter {0}", entry.name)} disabled={busy || index === 0} onClick={() => move(index, index - 1)}>↑</button>
      <button type="button" aria-label={localize("Descendre {0}", entry.name)} disabled={busy || index === entries.length - 1} onClick={() => move(index, index + 1)}>↓</button>
      <button type="button" aria-label={localize("Retirer {0}", entry.name)} disabled={busy} onClick={() => { URL.revokeObjectURL(entry.url); replace(entries.filter((item) => item.id !== entry.id)); }}>×</button>
    </li>)}</ol>
    <fieldset disabled={busy}><legend>{localize("Mise en page PDF")}</legend>
      <label>{localize("Format des pages")}<select value={layout.pageSize} onChange={(event) => setLayout({ ...layout, pageSize: event.currentTarget.value as ImageLayout["pageSize"] })}><option value="a4">A4</option><option value="letter">{localize("Lettre")}</option><option value="image">{localize("Taille de l’image (96 dpi)")}</option></select></label>
      <label>Orientation<select value={layout.orientation} onChange={(event) => setLayout({ ...layout, orientation: event.currentTarget.value as ImageLayout["orientation"] })}><option value="auto">{localize("Automatique")}</option><option value="portrait">Portrait</option><option value="landscape">{localize("Paysage")}</option></select></label>
      <label>{localize("Marges (points, 72 pt = 1 pouce)")}<input type="number" min="0" max="144" required value={layout.margin} onChange={(event) => setLayout({ ...layout, margin: event.currentTarget.valueAsNumber })} /></label>
      <label>{localize("Ajustement")}<select value={layout.fit} onChange={(event) => setLayout({ ...layout, fit: event.currentTarget.value as ImageLayout["fit"] })}><option value="contain">{localize("Contenir (sans découpe)")}</option><option value="no-upscale">{localize("Sans agrandissement")}</option></select></label>
      <label>{localize("Fond PDF")}<input type="color" value={layout.background} onChange={(event) => setLayout({ ...layout, background: event.currentTarget.value })} /></label>
    </fieldset>
    {error ? <p role="alert">{localize(error)}</p> : null}
    <div className="unsaved-dialog__actions"><button type="button" onClick={cancel}>{localize("Annuler")}</button><button type="submit" disabled={busy || !entries.length}>{busy ? localize("Traitement…") : localize("Créer le PDF")}</button></div>
  </form></div>;
}

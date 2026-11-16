import { useEffect, useRef, useState } from "react";
import type { DocumentSearchState } from "../hooks/usePdfSearch";
import type { PdfSearchHit, PdfSearchOptions } from "../pdf/search";

export function RedactionSearchPanel({ search, currentPage, onQuery, onOptions, onNavigate, onCreate, onClose }: {
  search: DocumentSearchState; currentPage: number;
  onQuery: (query: string) => void; onOptions: (options: PdfSearchOptions) => void;
  onNavigate: (index: number) => void;
  onCreate: (hits: PdfSearchHit[], signal: AbortSignal) => Promise<number>; onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setSelected(new Set()); setFeedback(""); }, [search.hits]);
  useEffect(() => () => controller.current?.abort(), []);
  const create = async (hits: PdfSearchHit[]) => {
    if (!hits.length || search.status !== "complete") return;
    if (hits.length > 1 && !window.confirm(`Créer des biffages en attente pour ${hits.length} occurrences sur ${new Set(hits.map((hit) => hit.pageNumber)).size} pages ? Aucune donnée n’est supprimée avant l’export sécurisé.`)) return;
    controller.current = new AbortController();
    setBusy(true); setFeedback("");
    try { const count = await onCreate(hits, controller.current.signal); setFeedback(`${count} nouvelles zones de biffage en attente créées.`); }
    catch (error) { if (!controller.current.signal.aborted) setFeedback(error instanceof Error ? error.message : "Aucune zone créée."); }
    finally { setBusy(false); }
  };
  const options = search.options ?? {};
  return <section className="shape-edit-toolbar" aria-label="Rechercher et biffer" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <strong>Biffage sécurisé · Recherche</strong>
    <label>Mot ou expression<input autoFocus aria-label="Terme à biffer" maxLength={500} value={search.query} onChange={(event) => onQuery(event.target.value)} /></label>
    <label><input type="checkbox" checked={options.caseSensitive ?? false} onChange={(event) => onOptions({ ...options, caseSensitive: event.target.checked })} />Respecter la casse</label>
    <label><input type="checkbox" checked={options.wholeWord ?? false} onChange={(event) => onOptions({ ...options, wholeWord: event.target.checked })} />Mot entier</label>
    <label>Portée de recherche<select aria-label="Portée de recherche" value={options.pageNumber ? "page" : "all"} onChange={(event) => onOptions({ ...options, pageNumber: event.target.value === "page" ? currentPage : undefined })}><option value="all">Toutes les pages</option><option value="page">Page actuelle</option></select></label>
    <output aria-live="polite" aria-label="Compteur des occurrences">{search.hits.length} occurrences · {selected.size} sélectionnées{search.status === "searching" ? " · Recherche en cours…" : ""}</output>
    {search.status === "complete" && search.query.trim() && !search.hits.length ? <p>Aucune occurrence textuelle détectable. Pour un scan sans OCR, utilisez le biffage manuel.</p> : null}
    {search.error ? <p role="alert">{search.error}</p> : null}
    <button type="button" disabled={busy || search.status !== "complete"} onClick={() => setSelected(new Set(search.hits.map((hit) => hit.id)))}>Sélectionner toutes les occurrences</button>
    <button type="button" disabled={busy || search.status !== "complete"} onClick={() => void create(search.hits.filter((hit) => hit.pageNumber === currentPage))}>Biffer toutes les occurrences de la page</button>
    <div className="redaction-search-results" aria-label="Occurrences à biffer">
      {search.hits.map((hit, index) => <div key={hit.id}>
        <label><input type="checkbox" aria-label={`Sélectionner l’occurrence ${index + 1} page ${hit.pageNumber}`} checked={selected.has(hit.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); event.target.checked ? next.add(hit.id) : next.delete(hit.id); return next; })} />Page {hit.pageNumber} · {index + 1}</label>
        <button type="button" onClick={() => onNavigate(index)} aria-label={`Voir l’occurrence ${index + 1}`}>{hit.context}</button>
        <button type="button" disabled={busy || search.status !== "complete"} onClick={() => void create([hit])} aria-label={`Biffer cette occurrence ${index + 1}`}>Biffer cette occurrence</button>
      </div>)}
    </div>
    <button type="button" disabled={busy || !selected.size || search.status !== "complete"} onClick={() => void create(search.hits.filter((hit) => selected.has(hit.id)))}>Biffer toutes les occurrences sélectionnées</button>
    {feedback ? <p role="status">{feedback}</p> : null}
    <p>Recherche dans le PDF source, sans détection des images ni anonymisation globale. Accents conservés ; espaces et retours de ligne équivalents. Les géométries ambiguës sont refusées.</p>
    <button type="button" onClick={onClose}>Fermer Rechercher et biffer</button>
  </section>;
}

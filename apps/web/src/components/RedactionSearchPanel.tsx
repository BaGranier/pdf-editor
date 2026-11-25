import { useLocale } from "../viewer/locale";
import { useEffect, useRef, useState } from "react";
import { searchIndexedPage, type IndexedPage } from "../editing/redactionIndex";
import type { RedactionEdit } from "../editing/types";
import type { PdfSearchHit, PdfSearchOptions } from "../pdf/search";

export function RedactionSearchPanel({ index, total, sourcePages, zones, currentPage, onNavigate, onCreate, onClose, visible = true }: {
  index: { pages: Map<number, IndexedPage>; scanned: number; complete: boolean; error: string | null };
  sourcePages: number[]; zones: RedactionEdit[]; currentPage: number; total: number;
  onNavigate: (hit: PdfSearchHit | null) => void;
  onCreate: (hits: PdfSearchHit[]) => number; onClose: () => void; visible?: boolean;
}) {
  const { t: localize } = useLocale();
  const { t, locale } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (visible) inputRef.current?.focus(); }, [visible]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PdfSearchOptions>({});
  const [hits, setHits] = useState<PdfSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const pageNumber = options.pageNumber ? currentPage : undefined;
  useEffect(() => {
    onNavigate(null);
    setHits([]);
    setError("");
    if (!index.complete || !query.trim()) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const request = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const matches: PdfSearchHit[] = [];
        for (const [i, number] of (pageNumber ? [pageNumber] : sourcePages).entries()) {
          if (request.signal.aborted) return;
          const page = index.pages.get(number);
          if (page) matches.push(...await searchIndexedPage(page, query, options, zones.filter((zone) => zone.page === number), request.signal));
          if (matches.length > 2000) throw new Error("Plus de 2 000 occurrences : affinez la recherche.");
          if (i % 12 === 11) await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
        if (!request.signal.aborted) setHits(matches);
      } catch (reason) {
        if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : "Recherche impossible.");
      } finally {
        if (!request.signal.aborted) setSearching(false);
      }
    }, 120);
    return () => { request.abort(); window.clearTimeout(timer); };
  }, [index, onNavigate, options, pageNumber, query, sourcePages, zones]);
  const status = !index.complete || searching ? "searching" : "complete";
  const sourcePageSet = new Set(sourcePages);
  const issues = [...index.pages.values()].filter((page) => page.issue && sourcePageSet.has(page.page));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  useEffect(() => setSelected(new Set()), [hits]);
  const create = (hits: PdfSearchHit[]) => {
    if (!hits.length || status !== "complete") return;
    if (hits.length > 1 && !window.confirm(locale === "en"
      ? `Redact ${hits.length} matches when exporting the PDF?`
      : `Créer des biffages pour ${hits.length} occurrences sur ${new Set(hits.map((hit) => hit.pageNumber)).size} pages ? Aucune donnée n’est supprimée avant l’export sécurisé.`)) return;
    try { const count = onCreate(hits); setFeedback(locale === "en" ? `${count} redaction areas added.` : `${count} nouvelles zones de biffage créées.`); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Aucune zone créée."); }
  };
  return <section hidden={!visible} className="shape-edit-toolbar redaction-panel" aria-label={t("Rechercher et biffer")} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
    <strong>{t("Biffage sécurisé · Recherche")}</strong>
    <label>{t("Mot ou expression")}<input ref={inputRef} aria-label={t("Terme à biffer")} maxLength={500} value={query} onChange={(event) => { setFeedback(""); setQuery(event.target.value); }} /></label>
    <label><input type="checkbox" checked={options.caseSensitive ?? false} onChange={(event) => setOptions({ ...options, caseSensitive: event.target.checked })} />{t("Respecter la casse")}</label>
    <label><input type="checkbox" checked={options.wholeWord ?? false} onChange={(event) => setOptions({ ...options, wholeWord: event.target.checked })} />{t("Mot entier")}</label>
    <label>{t("Portée de recherche")}<select aria-label={t("Portée de recherche")} value={options.pageNumber ? "page" : "all"} onChange={(event) => setOptions({ ...options, pageNumber: event.target.value === "page" ? currentPage : undefined })}><option value="all">{t("Toutes les pages")}</option><option value="page">{t("Page actuelle")}</option></select></label>
    <output aria-live="polite" aria-label={t("Compteur des occurrences")}>{locale === "en" ? `${hits.length} matches · ${selected.size} selected` : `${hits.length} occurrences · ${selected.size} sélectionnées`}
      {status === "searching" ? ` · ${t("Recherche en cours…")}` : ""}</output>
    {status === "complete" && query.trim() && !hits.length ? <p>{t("Aucune occurrence détectée. Vous pouvez tracer une zone de biffage manuellement.")}</p> : null}
    {!index.complete && !index.error ? <p role="status">{t("Analyse du texte et OCR")} · {index.scanned}/{total} pages</p> : null}
    {index.error || error ? <p role="alert">{t(index.error ?? error)}</p> : null}
    {issues.length ? <details open><summary>{t("OCR à vérifier")} {issues.length} page(s)</summary>
      <ul>{issues.map((page) => <li key={page.page}>{t("Page source")} {page.page} · {t(page.issue ?? "")}</li>)}</ul>
    </details> : null}
    <button type="button" disabled={status !== "complete"} onClick={() => setSelected(new Set(hits.map((hit) => hit.id)))}>{t("Sélectionner toutes les occurrences")}</button>
    <button type="button" disabled={status !== "complete"} onClick={() => create(hits.filter((hit) => hit.pageNumber === currentPage))}>{t("Biffer toutes les occurrences de la page")}</button>
    <details className="redaction-results-accordion">
      <summary>{t("Occurrences détectées")} ({hits.length})</summary>
      <div className="redaction-search-results" aria-label={t("Occurrences à biffer")}>
      {hits.map((hit, index) => <div key={hit.id}>
        <label><input type="checkbox" aria-label={locale === "en" ? `Select match ${index + 1} on page ${hit.pageNumber}` : `Sélectionner l’occurrence ${index + 1} page ${hit.pageNumber}`} checked={selected.has(hit.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); event.target.checked ? next.add(hit.id) : next.delete(hit.id); return next; })} />Page {hit.pageNumber} · {index + 1}</label>
        <button type="button" onClick={() => onNavigate(hit)} aria-label={`${locale === "en" ? "Go to match" : "Voir l’occurrence"} ${index + 1}`}>{hit.context}</button>
        <button type="button" disabled={status !== "complete"} onClick={() => create([hit])} aria-label={`${locale === "en" ? "Redact match" : "Biffer cette occurrence"} ${index + 1}`}>{t("Biffer cette occurrence")}</button>
      </div>)}
      </div>
    </details>
    <button type="button" className="redaction-apply" disabled={!selected.size || status !== "complete"} onClick={() => create(hits.filter((hit) => selected.has(hit.id)))}>{t("Appliquer le biffage")}</button>
    {feedback ? <p role="status">{t(feedback)}</p> : null}
    <p>{t("La recherche utilise le texte natif, le texte modifié et l’OCR des pages comportant du contenu visuel. Vérifiez les zones avant de générer le PDF.")}</p>
    <button type="button" className="redaction-close" onClick={onClose}>{t("Fermer onglet")}</button>
  </section>;
}

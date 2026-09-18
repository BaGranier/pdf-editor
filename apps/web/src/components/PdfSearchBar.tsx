import { useEffect, useRef } from "react";

type PdfSearchBarProps = {
  query: string;
  resultIndex: number;
  resultCount: number;
  pagesScanned: number;
  totalPages: number;
  isSearching: boolean;
  error: string | null;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
};

export function PdfSearchBar({
  query,
  resultIndex,
  resultCount,
  pagesScanned,
  totalPages,
  isSearching,
  error,
  onQueryChange,
  onNext,
  onPrevious,
  onClose,
}: PdfSearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <section className="pdf-search-bar" role="search" aria-label="Rechercher dans le document">
      <label className="visually-hidden" htmlFor="pdf-search-query">Rechercher dans le document</label>
      <span aria-hidden="true">⌕</span>
      <input
        ref={inputRef}
        id="pdf-search-query"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.shiftKey ? onPrevious() : onNext();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder="Rechercher"
        autoComplete="off"
        spellCheck={false}
      />
      <output aria-live="polite" aria-label="Résultats de recherche">
        {query.trim()
          ? `${resultCount === 0 ? 0 : resultIndex + 1} / ${resultCount}${isSearching ? ` · ${pagesScanned} / ${totalPages}` : ""}`
          : ""}
      </output>
      <button type="button" onClick={onPrevious} disabled={resultCount === 0} aria-label="Résultat précédent" title="Résultat précédent (Shift+Entrée)">↑</button>
      <button type="button" onClick={onNext} disabled={resultCount === 0} aria-label="Résultat suivant" title="Résultat suivant (Entrée)">↓</button>
      <button type="button" onClick={onClose} aria-label="Fermer la recherche" title="Fermer la recherche">×</button>
      {error ? <span className="pdf-search-bar__error" role="alert">{error}</span> : null}
    </section>
  );
}

export type PdfSearchHit = {
  id: string;
  pageNumber: number;
  context: string;
  /** Offsets in the concatenated PDF.js text items (also used by Ctrl+F overlays). */
  start: number;
  end: number;
  proof?: { digest: string; start: number; end: number; text: string };
};
export type PdfSearchProgress = { pagesScanned: number; totalPages: number; hits: PdfSearchHit[] };
export type PdfSearchOptions = { caseSensitive?: boolean; wholeWord?: boolean; pageNumber?: number; geometryProof?: boolean };
type TextItemLike = { str: string; hasEOL?: boolean };
type SearchablePdfPage = { getTextContent: () => Promise<{ items: unknown[] }> };
export type SearchablePdfDocument = { numPages: number; getPage: (pageNumber: number) => Promise<SearchablePdfPage> };
function isTextItem(value: unknown): value is TextItemLike { return typeof value === "object" && value !== null && typeof (value as Partial<TextItemLike>).str === "string"; }
function abortIfNeeded(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException("Recherche annulée.", "AbortError"); }
const canonical = (value: string) => value.normalize("NFC").replace(/\s/gu, "");
const normalize = (value: string, sensitive: boolean) => sensitive ? value.normalize("NFC") : value.normalize("NFC").toLocaleLowerCase();
const word = (value: string) => /[\p{L}\p{N}_]/u.test(value);

/** One matcher for Ctrl+F and preparation of secure redactions. Geometry is NEVER inferred from DOM highlights. */
export async function searchPdfPage(page: SearchablePdfPage, pageNumber: number, query: string, signal?: AbortSignal, options: PdfSearchOptions = {}): Promise<PdfSearchHit[]> {
  abortIfNeeded(signal);
  const needle = normalize(query.trim(), Boolean(options.caseSensitive)).replace(/\s+/gu, " ");
  if (!needle) return [];
  const content = await page.getTextContent();
  abortIfNeeded(signal);
  let raw = "", normalized = "";
  const starts: number[] = [], ends: number[] = [];
  for (const item of content.items.filter(isTextItem)) {
    const base = raw.length;
    raw += item.str;
    for (const cluster of item.str.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
      const text = normalize(cluster[0], Boolean(options.caseSensitive));
      const start = base + cluster.index!, end = start + cluster[0].length;
      for (const char of text) {
        if (/\s/u.test(char)) {
          if (normalized.endsWith(" ")) { ends[ends.length - 1] = end; continue; }
          normalized += " "; starts.push(start); ends.push(end);
        } else {
          normalized += char;
          for (let i = 0; i < char.length; i++) { starts.push(start); ends.push(end); }
        }
      }
    }
    if (item.hasEOL && !normalized.endsWith(" ")) { normalized += " "; starts.push(raw.length); ends.push(raw.length); }
  }
  const hits: PdfSearchHit[] = [];
  let position = normalized.indexOf(needle);
  while (position >= 0) {
    const endPosition = position + needle.length;
    const before = [...normalized.slice(0, position)].pop() ?? "";
    const after = [...normalized.slice(endPosition)][0] ?? "";
    if (!options.wholeWord || (!word(before) && !word(after))) {
      const start = starts[position], end = ends[endPosition - 1];
      hits.push({ id: `${pageNumber}:${start}:${end}`, pageNumber, start, end, context: raw.slice(Math.max(0, start - 40), end + 40) });
      if (options.geometryProof && hits.length > 2000) throw new Error("Plus de 2 000 occurrences : affinez la recherche avant de biffer.");
    }
    position = normalized.indexOf(needle, endPosition);
  }
  if (options.geometryProof && hits.length) {
    const bytes = new TextEncoder().encode(canonical(raw));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    for (const hit of hits) hit.proof = { digest, start: canonical(raw.slice(0, hit.start)).length, end: canonical(raw.slice(0, hit.end)).length, text: canonical(raw.slice(hit.start, hit.end)) };
  }
  return hits;
}

export async function searchPdfDocument(document: SearchablePdfDocument, query: string, options: PdfSearchOptions & { signal?: AbortSignal; onProgress?: (progress: PdfSearchProgress) => void } = {}): Promise<PdfSearchHit[]> {
  const hits: PdfSearchHit[] = [];
  const pages = options.pageNumber ? [options.pageNumber] : Array.from({ length: document.numPages }, (_, index) => index + 1);
  for (const [index, pageNumber] of pages.entries()) {
    abortIfNeeded(options.signal);
    if (pageNumber < 1 || pageNumber > document.numPages) throw new Error("Page de recherche invalide.");
    const page = await document.getPage(pageNumber);
    hits.push(...await searchPdfPage(page, pageNumber, query, options.signal, options));
    if (options.geometryProof && hits.length > 2000) throw new Error("Plus de 2 000 occurrences : affinez la recherche avant de biffer.");
    options.onProgress?.({ pagesScanned: index + 1, totalPages: pages.length, hits: [...hits] });
  }
  return hits;
}

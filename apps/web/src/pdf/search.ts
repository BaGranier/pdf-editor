export type PdfSearchHit = {
  id: string;
  pageNumber: number;
  context: string;
  /** Offsets in the concatenated PDF.js text items for this page. */
  start: number;
  end: number;
};

export type PdfSearchProgress = {
  pagesScanned: number;
  totalPages: number;
  hits: PdfSearchHit[];
};

type TextItemLike = {
  str: string;
};

type SearchablePdfPage = {
  getTextContent: () => Promise<{ items: unknown[] }>;
};

export type SearchablePdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<SearchablePdfPage>;
};

function isTextItem(value: unknown): value is TextItemLike {
  return typeof value === "object" && value !== null &&
    typeof (value as Partial<TextItemLike>).str === "string";
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Recherche annulée.", "AbortError");
  }
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase();
}

/**
 * Searches one PDF.js page without retaining its TextContent or PDF page.
 * The returned offsets map to the rendered text layer on demand, which gives
 * a partial match its actual glyph geometry instead of its parent span's box.
 */
export async function searchPdfPage(
  page: SearchablePdfPage,
  pageNumber: number,
  query: string,
  signal?: AbortSignal,
): Promise<PdfSearchHit[]> {
  abortIfNeeded(signal);
  const normalizedQuery = normalizeForSearch(query.trim());
  if (!normalizedQuery) return [];

  const content = await page.getTextContent();
  abortIfNeeded(signal);
  const hits: PdfSearchHit[] = [];

  const pageText = content.items
    .filter(isTextItem)
    .map((item) => item.str)
    .join("");
  const normalizedText = normalizeForSearch(pageText);
  let start = normalizedText.indexOf(normalizedQuery);
  while (start >= 0) {
    const end = start + normalizedQuery.length;
    const contextStart = Math.max(0, start - 40);
    const contextEnd = Math.min(pageText.length, end + 40);
    hits.push({
      id: `${pageNumber}:${start}:${end}`,
      pageNumber,
      context: pageText.slice(contextStart, contextEnd),
      start,
      end,
    });
    start = normalizedText.indexOf(normalizedQuery, end);
  }

  return hits;
}

/**
 * Scans pages sequentially. Only compact hits survive between pages, so this
 * runtime is independent from the heavy native-text editing runtime.
 */
export async function searchPdfDocument(
  document: SearchablePdfDocument,
  query: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: PdfSearchProgress) => void;
  } = {},
): Promise<PdfSearchHit[]> {
  const hits: PdfSearchHit[] = [];
  const totalPages = document.numPages;
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    abortIfNeeded(options.signal);
    const page = await document.getPage(pageNumber);
    hits.push(...await searchPdfPage(page, pageNumber, query, options.signal));
    options.onProgress?.({ pagesScanned: pageNumber, totalPages, hits: [...hits] });
  }
  return hits;
}

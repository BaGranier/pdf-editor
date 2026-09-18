import type { PdfRect } from "../editing/types";

export type PdfSearchHit = {
  id: string;
  pageNumber: number;
  rects: PdfRect[];
  context: string;
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
  transform: number[];
  width: number;
  height: number;
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
    typeof (value as Partial<TextItemLike>).str === "string" &&
    Array.isArray((value as Partial<TextItemLike>).transform) &&
    typeof (value as Partial<TextItemLike>).width === "number" &&
    typeof (value as Partial<TextItemLike>).height === "number";
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("Recherche annulée.", "AbortError");
  }
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase();
}

function rectForMatch(item: TextItemLike, start: number, end: number): PdfRect {
  const characterCount = Math.max(1, [...item.str].length);
  const startRatio = Math.min(1, start / characterCount);
  const endRatio = Math.min(1, end / characterCount);
  const x = item.transform[4] ?? 0;
  const baseline = item.transform[5] ?? 0;
  const height = Math.max(1, Math.abs(item.height || item.transform[3] || 1));
  const width = Math.max(1, Math.abs(item.width || item.transform[0] || 1));
  return {
    x0: x + width * startRatio,
    y0: baseline - height,
    x1: x + width * Math.max(startRatio, endRatio),
    y1: baseline,
  };
}

/**
 * Searches one PDF.js page without retaining its TextContent or PDF page
 * object. The returned hits are deliberately small, PDF-coordinate deltas.
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

  content.items.forEach((candidate, itemIndex) => {
    if (!isTextItem(candidate) || !candidate.str) return;
    const normalizedText = normalizeForSearch(candidate.str);
    let start = normalizedText.indexOf(normalizedQuery);
    while (start >= 0) {
      const end = start + normalizedQuery.length;
      hits.push({
        id: `${pageNumber}:${itemIndex}:${start}`,
        pageNumber,
        rects: [rectForMatch(candidate, start, end)],
        context: candidate.str,
        start,
        end,
      });
      start = normalizedText.indexOf(normalizedQuery, end);
    }
  });

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

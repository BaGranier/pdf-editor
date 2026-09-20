/**
 * Continuous mode keeps every page shell in the DOM so document height and
 * direct navigation stay stable. Only this small, contiguous range owns the
 * expensive PDF.js canvas/text/overlay runtime. A direct navigation can have
 * two focal pages for one frame; keep two small ranges instead of filling the
 * entire interval between them.
 */
export const CONTINUOUS_RENDER_BUFFER_PAGES = 2;

export function getContinuousRenderWindow(
  pageCount: number,
  focalPageNumbers: readonly number[],
  buffer = CONTINUOUS_RENDER_BUFFER_PAGES,
): Set<number> {
  if (pageCount <= 0) return new Set();

  const focalPages = focalPageNumbers
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount);

  const pages = focalPages.length > 0 ? focalPages : [1];
  const renderedPages = new Set<number>();
  for (const focalPage of pages) {
    const firstPage = Math.max(1, focalPage - Math.max(0, buffer));
    const lastPage = Math.min(pageCount, focalPage + Math.max(0, buffer));
    for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
      renderedPages.add(pageNumber);
    }
  }
  return renderedPages;
}

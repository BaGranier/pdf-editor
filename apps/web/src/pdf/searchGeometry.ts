import type { PdfSearchHit } from "./search";

type TextSegment = { node: Text; start: number; end: number };

function textSegments(container: HTMLElement): TextSegment[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const segments: TextSegment[] = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const end = offset + text.data.length;
    if (text.data.length > 0) segments.push({ node: text, start: offset, end });
    offset = end;
    node = walker.nextNode();
  }
  return segments;
}

function boundaryForOffset(segments: TextSegment[], offset: number, end: boolean) {
  const segment = end
    ? [...segments].reverse().find((entry) => offset >= entry.start && offset <= entry.end)
    : segments.find((entry) => offset >= entry.start && offset <= entry.end);
  if (!segment) return null;
  return { node: segment.node, offset: Math.max(0, Math.min(segment.node.data.length, offset - segment.start)) };
}

/** Creates a transient range only for a visible text layer. */
export function createSearchRange(container: HTMLElement, start: number, end: number): Range | null {
  if (start < 0 || end <= start) return null;
  const segments = textSegments(container);
  const rangeStart = boundaryForOffset(segments, start, false);
  const rangeEnd = boundaryForOffset(segments, end, true);
  if (!rangeStart || !rangeEnd) return null;
  const range = document.createRange();
  range.setStart(rangeStart.node, rangeStart.offset);
  range.setEnd(rangeEnd.node, rangeEnd.offset);
  return range;
}

export type SearchOverlayRect = { left: number; top: number; width: number; height: number };

/**
 * Resolves a compact logical hit against the currently rendered text layer.
 * The caller keeps only the returned CSS rectangles for its render; no Range,
 * DOMRect or DOM node is persisted in document search state.
 */
export function resolveSearchHitRects(
  hit: PdfSearchHit,
  textLayer: HTMLElement,
  surface: HTMLElement,
): SearchOverlayRect[] {
  const range = createSearchRange(textLayer, hit.start, hit.end);
  if (!range) return [];
  const surfaceRect = surface.getBoundingClientRect();
  const rects = [...range.getClientRects()]
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: rect.left - surfaceRect.left,
      top: rect.top - surfaceRect.top,
      width: rect.width,
      height: rect.height,
    }));
  range.detach?.();
  return rects;
}

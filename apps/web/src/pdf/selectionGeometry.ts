import type { PageViewport } from "pdfjs-dist";
import type { PdfRect } from "../editing/types";

export type ClientRectLike = Pick<DOMRect, "left" | "top" | "right" | "bottom" | "width" | "height">;

export function normalizeSelectionClientRects(rects: Iterable<ClientRectLike>, tolerance = 2): ClientRectLike[] {
  const usable = [...rects].filter((rect) => rect.width > 1 && rect.height > 1).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: ClientRectLike[][] = [];
  for (const rect of usable) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].top - rect.top) <= tolerance && Math.abs(line[0].bottom - rect.bottom) <= tolerance * 2) line.push(rect);
    else lines.push([rect]);
  }
  return lines.flatMap((line) => {
    const merged: ClientRectLike[] = [];
    for (const rect of line) {
      const previous = merged[merged.length - 1];
      if (previous && rect.left <= previous.right + tolerance) {
        merged[merged.length - 1] = { left: previous.left, top: Math.min(previous.top, rect.top), right: Math.max(previous.right, rect.right), bottom: Math.max(previous.bottom, rect.bottom), width: Math.max(previous.right, rect.right) - previous.left, height: Math.max(previous.bottom, rect.bottom) - Math.min(previous.top, rect.top) };
      } else merged.push(rect);
    }
    return merged;
  });
}

export function selectionClientRectsToPdfRects(rects: Iterable<ClientRectLike>, pageRect: Pick<DOMRect, "left" | "top">, viewport: PageViewport): PdfRect[] {
  return normalizeSelectionClientRects(rects).map((rect) => {
    const [x0, y0] = viewport.convertToPdfPoint(rect.left - pageRect.left, rect.top - pageRect.top);
    const [x1, y1] = viewport.convertToPdfPoint(rect.right - pageRect.left, rect.bottom - pageRect.top);
    return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  });
}

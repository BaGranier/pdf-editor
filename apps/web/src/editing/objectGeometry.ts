import type { PdfRect, PdfPoint } from "./types";
import type { ResizeHandle } from "./coordinates";

/** Keep the opposite corner fixed while constraining both native PDF axes. */
export function constrainSquare(rect: PdfRect, handle: ResizeHandle = "se"): PdfRect {
  const size = Math.min(rect.x1 - rect.x0, rect.y1 - rect.y0);
  const x0 = handle.endsWith("w") ? rect.x1 - size : rect.x0;
  const y0 = handle.startsWith("n") ? rect.y0 : rect.y1 - size;
  return { x0, y0, x1: x0 + size, y1: y0 + size };
}

/** Natural pixels map to points; grow tiny images, bound to 60% of the page. */
export function initialImageRect(viewBox: readonly number[], width: number, height: number): PdfRect {
  const [a, b, c, d] = viewBox;
  const pageWidth = Math.abs(c - a), pageHeight = Math.abs(d - b);
  const scale = Math.min(Math.max(1, 30 / width, 30 / height), pageWidth * 0.6 / width, pageHeight * 0.6 / height);
  const w = width * scale, h = height * scale;
  const x0 = Math.min(a, c) + (pageWidth - w) / 2;
  const y0 = Math.min(b, d) + (pageHeight - h) / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

/** Same open vector arrow head used by the UI and PDF engine. */
export function arrowHead(start: PdfPoint, end: PdfPoint, width: number): PdfPoint[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 0.001) return [end, end, end];
  const size = Math.min(length * 0.65, Math.max(6, width * 4));
  const ux = (end.x - start.x) / length, uy = (end.y - start.y) / length;
  return [
    { x: end.x - ux * size - uy * size * 0.5, y: end.y - uy * size + ux * size * 0.5 },
    end,
    { x: end.x - ux * size + uy * size * 0.5, y: end.y - uy * size - ux * size * 0.5 },
  ];
}

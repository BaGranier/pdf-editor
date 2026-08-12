import type { PageViewport } from "pdfjs-dist";
import type { PdfRect } from "./types";

export type PdfViewport = Pick<
  PageViewport,
  "convertToPdfPoint" | "convertToViewportPoint" | "transform" | "viewBox"
>;

type Point = {
  x: number;
  y: number;
};

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

export const MINIMUM_TEXT_RECT_WIDTH = 8;
export const MINIMUM_TEXT_RECT_HEIGHT = 9;

export function getMinimumTextRectSize(fontSize: number) {
  return {
    width: MINIMUM_TEXT_RECT_WIDTH,
    height: Math.max(MINIMUM_TEXT_RECT_HEIGHT, fontSize),
  };
}

export type ViewportRectStyle = {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));
const roundCssValue = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function normalizePdfRect(rect: PdfRect): PdfRect {
  return {
    x0: Math.min(rect.x0, rect.x1),
    y0: Math.min(rect.y0, rect.y1),
    x1: Math.max(rect.x0, rect.x1),
    y1: Math.max(rect.y0, rect.y1),
  };
}

export function screenPointToPdf(
  viewport: PdfViewport,
  point: Point,
): Point {
  const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
  return { x, y };
}

export function clampPdfRectToPage(
  viewport: PdfViewport,
  rect: PdfRect,
): PdfRect {
  const [viewX0, viewY0, viewX1, viewY1] = viewport.viewBox;
  const pageX0 = Math.min(viewX0, viewX1);
  const pageY0 = Math.min(viewY0, viewY1);
  const pageX1 = Math.max(viewX0, viewX1);
  const pageY1 = Math.max(viewY0, viewY1);
  const normalized = normalizePdfRect(rect);
  const width = Math.min(normalized.x1 - normalized.x0, pageX1 - pageX0);
  const height = Math.min(normalized.y1 - normalized.y0, pageY1 - pageY0);
  const x0 = clamp(normalized.x0, pageX0, pageX1 - width);
  const y0 = clamp(normalized.y0, pageY0, pageY1 - height);

  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

export function offsetPdfRectWithinPage(
  rect: PdfRect,
  pageView: readonly number[],
  offset: Point,
): PdfRect {
  if (pageView.length < 4) {
    return normalizePdfRect(rect);
  }
  const pageX0 = Math.min(pageView[0], pageView[2]);
  const pageY0 = Math.min(pageView[1], pageView[3]);
  const pageX1 = Math.max(pageView[0], pageView[2]);
  const pageY1 = Math.max(pageView[1], pageView[3]);
  const normalized = normalizePdfRect(rect);
  const width = Math.min(normalized.x1 - normalized.x0, pageX1 - pageX0);
  const height = Math.min(normalized.y1 - normalized.y0, pageY1 - pageY0);
  const x0 = clamp(normalized.x0 + offset.x, pageX0, pageX1 - width);
  // A positive visual Y offset moves downward, which is negative in native PDF Y.
  const y0 = clamp(normalized.y0 - offset.y, pageY0, pageY1 - height);

  return { x0, y0, x1: x0 + width, y1: y0 + height };
}

export function createPdfRectAtScreenPoint(
  viewport: PdfViewport,
  point: Point,
  width = 220,
  height = 72,
): PdfRect {
  const pdfPoint = screenPointToPdf(viewport, point);

  return clampPdfRectToPage(viewport, {
    x0: pdfPoint.x,
    y0: pdfPoint.y - height,
    x1: pdfPoint.x + width,
    y1: pdfPoint.y,
  });
}

export function translatePdfRectByScreenDelta(
  viewport: PdfViewport,
  rect: PdfRect,
  delta: Point,
): PdfRect {
  const origin = screenPointToPdf(viewport, { x: 0, y: 0 });
  const destination = screenPointToPdf(viewport, delta);

  return clampPdfRectToPage(viewport, {
    x0: rect.x0 + destination.x - origin.x,
    y0: rect.y0 + destination.y - origin.y,
    x1: rect.x1 + destination.x - origin.x,
    y1: rect.y1 + destination.y - origin.y,
  });
}

export function createProportionalPdfRectAtScreenPoint(
  viewport: PdfViewport,
  point: Point,
  aspectRatio: number,
  width = 180,
): PdfRect {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error("Le ratio de l'image doit être positif.");
  }

  return createPdfRectAtScreenPoint(viewport, point, width, width / aspectRatio);
}

export function resizePdfRectByScreenDelta(
  viewport: PdfViewport,
  rect: PdfRect,
  delta: Point,
  aspectRatio: number,
  minimumWidth = 30,
): PdfRect {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error("Le ratio de l'image doit être positif.");
  }

  const normalized = normalizePdfRect(rect);
  const origin = screenPointToPdf(viewport, { x: 0, y: 0 });
  const destination = screenPointToPdf(viewport, delta);
  const deltaWidth = destination.x - origin.x;
  const deltaHeightAsWidth = (origin.y - destination.y) * aspectRatio;
  const originalWidth = normalized.x1 - normalized.x0;
  const requestedWidth =
    Math.abs(deltaWidth) >= Math.abs(deltaHeightAsWidth)
      ? originalWidth + deltaWidth
      : originalWidth + deltaHeightAsWidth;
  const [viewX0, viewY0, viewX1, viewY1] = viewport.viewBox;
  const pageX1 = Math.max(viewX0, viewX1);
  const pageY0 = Math.min(viewY0, viewY1);
  const maximumWidth = Math.max(
    1,
    Math.min(
      pageX1 - normalized.x0,
      (normalized.y1 - pageY0) * aspectRatio,
    ),
  );
  const effectiveMinimum = Math.min(minimumWidth, maximumWidth);
  const width = clamp(requestedWidth, effectiveMinimum, maximumWidth);
  const height = width / aspectRatio;

  return {
    x0: normalized.x0,
    y0: normalized.y1 - height,
    x1: normalized.x0 + width,
    y1: normalized.y1,
  };
}

export function resizeFreeformPdfRectByScreenDelta(
  viewport: PdfViewport,
  rect: PdfRect,
  delta: Point,
  handle: ResizeHandle,
  minimumWidth = MINIMUM_TEXT_RECT_WIDTH,
  minimumHeight = MINIMUM_TEXT_RECT_HEIGHT,
): PdfRect {
  const normalized = normalizePdfRect(rect);
  const origin = screenPointToPdf(viewport, { x: 0, y: 0 });
  const destination = screenPointToPdf(viewport, delta);
  const deltaX = destination.x - origin.x;
  const deltaY = destination.y - origin.y;
  const [viewX0, viewY0, viewX1, viewY1] = viewport.viewBox;
  const pageX0 = Math.min(viewX0, viewX1);
  const pageY0 = Math.min(viewY0, viewY1);
  const pageX1 = Math.max(viewX0, viewX1);
  const pageY1 = Math.max(viewY0, viewY1);
  const effectiveMinimumWidth = Math.min(minimumWidth, pageX1 - pageX0);
  const effectiveMinimumHeight = Math.min(minimumHeight, pageY1 - pageY0);
  let { x0, y0, x1, y1 } = normalized;

  if (handle.endsWith("w")) {
    x0 = clamp(x0 + deltaX, pageX0, x1 - effectiveMinimumWidth);
  } else {
    x1 = clamp(x1 + deltaX, x0 + effectiveMinimumWidth, pageX1);
  }

  // CSS top maps to the native PDF y1 edge; CSS bottom maps to y0.
  if (handle.startsWith("n")) {
    y1 = clamp(y1 + deltaY, y0 + effectiveMinimumHeight, pageY1);
  } else {
    y0 = clamp(y0 + deltaY, pageY0, y1 - effectiveMinimumHeight);
  }

  return { x0, y0, x1, y1 };
}

export function pdfRectToViewportStyle(
  viewport: PdfViewport,
  rect: PdfRect,
): ViewportRectStyle {
  const normalized = normalizePdfRect(rect);
  const [left, top] = viewport.convertToViewportPoint(
    normalized.x0,
    normalized.y1,
  );
  const [a, b, c, d] = viewport.transform;
  const horizontalScale = Math.hypot(a, b);
  const verticalScale = Math.hypot(c, d);

  if (horizontalScale === 0 || verticalScale === 0) {
    throw new Error("La transformation de page PDF est invalide.");
  }

  return {
    left: roundCssValue(left),
    top: roundCssValue(top),
    width: roundCssValue((normalized.x1 - normalized.x0) * horizontalScale),
    height: roundCssValue((normalized.y1 - normalized.y0) * verticalScale),
    transform: `matrix(${roundCssValue(a / horizontalScale)}, ${roundCssValue(b / horizontalScale)}, ${roundCssValue(-c / verticalScale)}, ${roundCssValue(-d / verticalScale)}, 0, 0)`,
  };
}

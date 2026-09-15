import type { PdfViewport } from "./coordinates";
import { screenPointToPdf } from "./coordinates";
import type { FreehandEdit, PdfPoint } from "./types";

type Point = PdfPoint;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const projection = clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy),
    0,
    1,
  );
  return Math.hypot(point.x - (start.x + projection * dx), point.y - (start.y + projection * dy));
}

/** Tests the actual polyline, not its enclosing bounding box. */
export function isPointNearFreehand(edit: FreehandEdit, point: Point, tolerance: number) {
  return edit.points.some((start, index) => {
    const end = edit.points[index + 1];
    return end ? distanceToSegment(point, start, end) <= tolerance : false;
  });
}

export function getFreehandHitTolerance(viewport: PdfViewport, strokeWidth: number) {
  const scale = Math.max(0.01, Math.hypot(viewport.transform[0], viewport.transform[1]));
  return Math.max(6 / scale, strokeWidth / 2 + 2 / scale);
}

/** Applies one uniform PDF-space translation while keeping the whole trace on its page. */
export function translateFreehandByScreenDelta(
  viewport: PdfViewport,
  edit: FreehandEdit,
  delta: Point,
): FreehandEdit {
  const origin = screenPointToPdf(viewport, { x: 0, y: 0 });
  const destination = screenPointToPdf(viewport, delta);
  const requestedX = destination.x - origin.x;
  const requestedY = destination.y - origin.y;
  const [viewX0, viewY0, viewX1, viewY1] = viewport.viewBox;
  const pageX0 = Math.min(viewX0, viewX1);
  const pageY0 = Math.min(viewY0, viewY1);
  const pageX1 = Math.max(viewX0, viewX1);
  const pageY1 = Math.max(viewY0, viewY1);
  const dx = clamp(requestedX, pageX0 - edit.rect.x0, pageX1 - edit.rect.x1);
  const dy = clamp(requestedY, pageY0 - edit.rect.y0, pageY1 - edit.rect.y1);

  return {
    ...edit,
    rect: { x0: edit.rect.x0 + dx, y0: edit.rect.y0 + dy, x1: edit.rect.x1 + dx, y1: edit.rect.y1 + dy },
    points: edit.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

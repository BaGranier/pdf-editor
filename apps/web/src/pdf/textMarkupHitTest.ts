import type { PdfPoint, TextMarkupEdit } from "../editing/types";

const LINE_TOLERANCE = 4;

export function findTextMarkupAtPoint(
  edits: readonly TextMarkupEdit[],
  page: number,
  point: PdfPoint,
  lineTolerance = LINE_TOLERANCE,
): TextMarkupEdit | null {
  for (const edit of [...edits].reverse()) {
    if (edit.page !== page) continue;
    for (const rect of edit.rects) {
      if (edit.kind === "highlight") {
        if (point.x >= rect.x0 && point.x <= rect.x1 && point.y >= rect.y0 && point.y <= rect.y1) return edit;
        continue;
      }
      const segmentY = edit.kind === "underline" ? rect.y0 + lineTolerance / 2 : (rect.y0 + rect.y1) / 2;
      if (point.x >= rect.x0 - lineTolerance && point.x <= rect.x1 + lineTolerance && Math.abs(point.y - segmentY) <= lineTolerance) return edit;
    }
  }
  return null;
}

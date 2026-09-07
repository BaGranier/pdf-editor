import type { PageViewport } from "pdfjs-dist";
import type { TextMarkupEdit } from "../editing/types";

export function TextMarkupLayer({ edit, viewport }: { edit: TextMarkupEdit; viewport: PageViewport }) {
  return <svg className={`pdf-text-markup pdf-text-markup--${edit.kind}`} aria-label={`${edit.kind} page ${edit.page}`} viewBox={`0 0 ${viewport.width} ${viewport.height}`}><g>{edit.rects.map((rect, index) => { const [left, top] = viewport.convertToViewportPoint(rect.x0, rect.y1); const [right, bottom] = viewport.convertToViewportPoint(rect.x1, rect.y0); const x = Math.min(left, right); const y = Math.min(top, bottom); const width = Math.abs(right - left); const height = Math.abs(bottom - top); return edit.kind === "highlight" ? <rect key={index} x={x} y={y} width={width} height={height} fill={edit.color} opacity=".32" /> : <line key={index} x1={x} x2={x + width} y1={edit.kind === "underline" ? y + height - 1 : y + height / 2} y2={edit.kind === "underline" ? y + height - 1 : y + height / 2} stroke={edit.color} strokeWidth="2" />; })}</g></svg>;
}

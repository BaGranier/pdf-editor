import { useMemo } from "react";
import type { PageViewport } from "pdfjs-dist";
import type { FreehandEdit } from "../editing/types";

type Props = { edit: FreehandEdit; viewport: PageViewport; selected: boolean; onSelect: () => void };

export function FreehandEditBlock({ edit, viewport, selected, onSelect }: Props) {
  const path = useMemo(() => edit.points.map((point, index) => {
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  }).join(" "), [edit.points, viewport]);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  return <svg className={selected ? "pdf-freehand-edit is-selected" : "pdf-freehand-edit"} aria-label={`Dessin libre page ${edit.page}`} viewBox={`0 0 ${viewport.width} ${viewport.height}`} onClick={(event) => { event.stopPropagation(); onSelect(); }}><path d={path} fill="none" stroke={edit.style.color} strokeOpacity={edit.style.opacity ?? 1} strokeWidth={Math.max(1, edit.style.strokeWidth * scale)} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

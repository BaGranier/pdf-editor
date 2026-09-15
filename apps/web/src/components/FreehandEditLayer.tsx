import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PageViewport } from "pdfjs-dist";
import { getFreehandHitTolerance, isPointNearFreehand, translateFreehandByScreenDelta } from "../editing/freehandGeometry";
import type { FreehandEdit } from "../editing/types";

type Props = {
  edit: FreehandEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onMove: (edit: FreehandEdit) => void;
};

export function FreehandEditBlock({ edit, viewport, selected, onSelect, onMove }: Props) {
  const interactionRef = useRef<{ clientX: number; clientY: number; edit: FreehandEdit } | null>(null);
  const draftRef = useRef(edit);
  const [draft, setDraft] = useState(edit);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const path = useMemo(() => draft.points.map((point, index) => {
    const [x, y] = viewport.convertToViewportPoint(point.x, point.y);
    return `${index === 0 ? "M" : "L"}${x} ${y}`;
  }).join(" "), [draft.points, viewport]);
  const selectionRect = useMemo(() => {
    const [left, top] = viewport.convertToViewportPoint(draft.rect.x0, draft.rect.y1);
    const [right, bottom] = viewport.convertToViewportPoint(draft.rect.x1, draft.rect.y0);
    const padding = 5 * scale;
    return { x: Math.min(left, right) - padding, y: Math.min(top, bottom) - padding, width: Math.abs(right - left) + padding * 2, height: Math.abs(bottom - top) + padding * 2 };
  }, [draft.rect, scale, viewport]);

  useEffect(() => {
    if (!interactionRef.current) {
      draftRef.current = edit;
      setDraft(edit);
    }
  }, [edit]);

  useEffect(() => {
    const move = (event: globalThis.MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const next = translateFreehandByScreenDelta(viewport, interaction.edit, {
        x: event.clientX - interaction.clientX,
        y: event.clientY - interaction.clientY,
      });
      draftRef.current = next;
      setDraft(next);
    };
    const finish = (event?: globalThis.MouseEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      interactionRef.current = null;
      const moved = event && Math.hypot(event.clientX - interaction.clientX, event.clientY - interaction.clientY) >= 1;
      if (moved) onMove(draftRef.current);
    };
    const cancel = () => finish();
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", finish);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("blur", cancel);
    };
  }, [onMove, viewport]);

  const startMove = (event: ReactMouseEvent<SVGPathElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;
    const viewportPoint = { x: (event.clientX - bounds.left) * (viewport.width / bounds.width), y: (event.clientY - bounds.top) * (viewport.height / bounds.height) };
    const [x, y] = viewport.convertToPdfPoint(viewportPoint.x, viewportPoint.y);
    if (!isPointNearFreehand(edit, { x, y }, getFreehandHitTolerance(viewport, edit.style.strokeWidth))) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    draftRef.current = edit;
    interactionRef.current = { clientX: event.clientX, clientY: event.clientY, edit };
  };

  const visualWidth = Math.max(1, draft.style.strokeWidth * scale);
  const hitWidth = Math.max(visualWidth + 8, 12);
  return (
    <svg className={selected ? "pdf-freehand-edit is-selected" : "pdf-freehand-edit"} aria-label={`Dessin libre page ${edit.page}`} viewBox={`0 0 ${viewport.width} ${viewport.height}`}>
      {selected ? <rect className="pdf-freehand-edit__selection" x={selectionRect.x} y={selectionRect.y} width={selectionRect.width} height={selectionRect.height} /> : null}
      <path d={path} fill="none" stroke={draft.style.color} strokeOpacity={draft.style.opacity ?? 1} strokeWidth={visualWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      <path d={path} fill="none" stroke="rgb(0 0 0 / 0.001)" strokeWidth={hitWidth} strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" onMouseDown={startMove} onClick={(event) => { event.stopPropagation(); onSelect(); }} />
    </svg>
  );
}

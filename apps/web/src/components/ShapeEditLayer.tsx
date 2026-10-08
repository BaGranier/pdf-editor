import { arrowHead, constrainSquare } from "../editing/objectGeometry";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  pdfRectToViewportStyle,
  resizeFreeformPdfRectByScreenDelta,
  translatePdfRectByScreenDelta,
  type ResizeHandle,
} from "../editing/coordinates";
import type { PdfRect, ShapeEdit, LineGeometry } from "../editing/types";

type ShapeEditBlockProps = {
  edit: ShapeEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onMove: (rect: PdfRect, line?: LineGeometry) => void;
};

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

export function ShapeEditBlock({
  edit,
  viewport,
  selected,
  onSelect,
  onMove,
}: ShapeEditBlockProps) {
  const interactionRef = useRef<{
    kind: "move" | "resize" | "start" | "end";
    handle?: ResizeHandle;
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const [draftRect, setDraftRect] = useState(edit.rect);
  const interactionRectRef = useRef(edit.rect);
  const draftLineRef = useRef<LineGeometry | null>(null);
  const [draftLine, setDraftLine] = useState<LineGeometry | null>(null);
  const style = pdfRectToViewportStyle(viewport, draftRect);
  const viewportScale = Math.hypot(viewport.transform[0], viewport.transform[1]);

  useEffect(() => {
    if (!interactionRef.current) {
      interactionRectRef.current = edit.rect;
      setDraftRect(edit.rect);
    }
  }, [edit.id, edit.rect]);

  useEffect(() => {
    function handleMouseMove(event: globalThis.MouseEvent) {
      const interaction = interactionRef.current;
      if (!interaction) {
        return;
      }
      const delta = {
        x: event.clientX - interaction.clientX,
        y: event.clientY - interaction.clientY,
      };
      if (interaction.kind === "start" || interaction.kind === "end") {
        const start = edit.start ?? { x: edit.rect.x0, y: edit.rect.y1 };
        const end = edit.end ?? { x: edit.rect.x1, y: edit.rect.y0 };
        const origin = viewport.convertToPdfPoint(0, 0), next = viewport.convertToPdfPoint(delta.x, delta.y);
        const old = interaction.kind === "start" ? start : end;
        const [x0, y0, x1, y1] = viewport.viewBox;
        const point = { x: Math.max(x0, Math.min(x1, old.x + next[0] - origin[0])), y: Math.max(y0, Math.min(y1, old.y + next[1] - origin[1])) };
        const line = interaction.kind === "start" ? { start: point, end } : { start, end: point };
        draftLineRef.current = line; setDraftLine(line);
        const rect = { x0: Math.min(line.start.x, line.end.x), y0: Math.min(line.start.y, line.end.y), x1: Math.max(line.start.x, line.end.x) + 0.1, y1: Math.max(line.start.y, line.end.y) + 0.1 };
        interactionRectRef.current = rect; setDraftRect(rect);
        return;
      }
      const rawRect =
        interaction.kind === "move"
          ? translatePdfRectByScreenDelta(viewport, interaction.rect, delta)
          : resizeFreeformPdfRectByScreenDelta(
              viewport,
              interaction.rect,
              delta,
              interaction.handle ?? "se",
              12,
              12,
            );
      const rect = interaction.kind === "resize" && (edit.shapeType === "square" || edit.shapeType === "circle") ? constrainSquare(rawRect, interaction.handle) : rawRect;
      interactionRectRef.current = rect;
      setDraftRect(rect);
    }

    function finishInteraction() {
      if (!interactionRef.current) {
        return;
      }
      interactionRef.current = null;
      const next = interactionRectRef.current;
      const transform = (point: { x: number; y: number }) => ({
        x: next.x0 + (point.x - edit.rect.x0) * (next.x1 - next.x0) / (edit.rect.x1 - edit.rect.x0),
        y: next.y0 + (point.y - edit.rect.y0) * (next.y1 - next.y0) / (edit.rect.y1 - edit.rect.y0),
      });
      if (draftLineRef.current) { onMove(next, draftLineRef.current); draftLineRef.current = null; setDraftLine(null); }
      else if (edit.start && edit.end) onMove(next, { start: transform(edit.start), end: transform(edit.end) });
      else onMove(next);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishInteraction);
    window.addEventListener("blur", finishInteraction);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishInteraction);
      window.removeEventListener("blur", finishInteraction);
    };
  }, [edit, onMove, viewport]);

  const startInteraction = (
    kind: "move" | "resize" | "start" | "end",
    event: ReactMouseEvent<HTMLElement>,
    handle?: ResizeHandle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    draftLineRef.current = null; setDraftLine(null);
    interactionRectRef.current = edit.rect;
    interactionRef.current = {
      kind,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: edit.rect,
    };
  };

  const fill = edit.shapeType === "line" ? "none" : edit.style.fillColor ?? "none";
  const strokeWidth = Math.max(1, edit.style.strokeWidth * viewportScale);
  const opacity = Math.min(1, Math.max(0, edit.style.opacity ?? 1));
  const shapeStyle = {
    stroke: edit.style.strokeColor,
    strokeWidth,
    vectorEffect: "non-scaling-stroke" as const,
  };

  const w = Math.max(1, style.width), h = Math.max(1, style.height);
  // Use normalized coordinates so a live drag transforms the endpoints together.
  const linePoint = (p: { x: number; y: number }) => ({ x: (p.x - edit.rect.x0) / (edit.rect.x1 - edit.rect.x0) * w, y: (edit.rect.y1 - p.y) / (edit.rect.y1 - edit.rect.y0) * h });
  const draftPoint = (p: { x: number; y: number }) => ({ x: (p.x - draftRect.x0) / (draftRect.x1 - draftRect.x0) * w, y: (draftRect.y1 - p.y) / (draftRect.y1 - draftRect.y0) * h });
  const start = draftLine?.start ? draftPoint(draftLine.start) : edit.start ? linePoint(edit.start) : { x: 0, y: 0 };
  const end = draftLine?.end ? draftPoint(draftLine.end) : edit.end ? linePoint(edit.end) : { x: w, y: h };
  const head = arrowHead(start, end, strokeWidth);
  return (
    <div
      className={selected ? "pdf-shape-edit is-selected" : "pdf-shape-edit"}
      data-shape-edit-id={edit.id}
      data-shape-type={edit.shapeType}
      aria-label={`${{ rectangle: "Rectangle", square: "Carré", ellipse: "Ellipse", circle: "Cercle", line: edit.lineStyle === "arrow" ? "Flèche" : "Ligne" }[edit.shapeType]} page ${edit.page}`}
      tabIndex={0}
      style={{
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        transform: style.transform,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onMouseDown={(event) => startInteraction("move", event)}
      onFocus={onSelect}
    >
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        <g opacity={opacity}>
        {edit.shapeType === "rectangle" || edit.shapeType === "square" ? (
          <rect x="0" y="0" width={w} height={h} fill={fill} style={shapeStyle} />
        ) : null}
        {edit.shapeType === "ellipse" || edit.shapeType === "circle" ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={fill} style={shapeStyle} />
        ) : null}
        {edit.shapeType === "line" ? <>
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} style={shapeStyle} />
          {edit.lineStyle === "arrow" ? <polyline points={head.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" style={shapeStyle} /> : null}
        </> : null}
        </g>
      </svg>
      {selected && edit.shapeType === "line" ? <>
        <button type="button" className="pdf-shape-edit__endpoint" style={{ left: start.x, top: start.y }} aria-label="Déplacer le début du trait" onMouseDown={(event) => startInteraction("start", event)} />
        <button type="button" className="pdf-shape-edit__endpoint" style={{ left: end.x, top: end.y }} aria-label="Déplacer la fin du trait" onMouseDown={(event) => startInteraction("end", event)} />
      </> : null}
      {selected
        ? RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`pdf-shape-edit__resize pdf-shape-edit__resize--${handle}`}
              aria-label={`Redimensionner la forme depuis ${handle}`}
              data-resize-handle={handle}
              onMouseDown={(event) => startInteraction("resize", event, handle)}
            />
          ))
        : null}
    </div>
  );
}

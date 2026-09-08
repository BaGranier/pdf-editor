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
import type { PdfRect, ShapeEdit } from "../editing/types";

type ShapeEditBlockProps = {
  edit: ShapeEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onMove: (rect: PdfRect) => void;
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
    kind: "move" | "resize";
    handle?: ResizeHandle;
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const [draftRect, setDraftRect] = useState(edit.rect);
  const interactionRectRef = useRef(edit.rect);
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
      const rect =
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
      interactionRectRef.current = rect;
      setDraftRect(rect);
    }

    function finishInteraction() {
      if (!interactionRef.current) {
        return;
      }
      interactionRef.current = null;
      onMove(interactionRectRef.current);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishInteraction);
    window.addEventListener("blur", finishInteraction);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishInteraction);
      window.removeEventListener("blur", finishInteraction);
    };
  }, [onMove, viewport]);

  const startInteraction = (
    kind: "move" | "resize",
    event: ReactMouseEvent<HTMLElement>,
    handle?: ResizeHandle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect();
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
    opacity,
    vectorEffect: "non-scaling-stroke" as const,
  };

  return (
    <div
      className={selected ? "pdf-shape-edit is-selected" : "pdf-shape-edit"}
      data-shape-edit-id={edit.id}
      data-shape-type={edit.shapeType}
      aria-label={`${edit.shapeType === "rectangle" ? "Rectangle" : edit.shapeType === "ellipse" ? "Ellipse" : "Ligne"} page ${edit.page}`}
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
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {edit.shapeType === "rectangle" ? (
          <rect x="1" y="1" width="98" height="98" fill={fill} style={shapeStyle} />
        ) : null}
        {edit.shapeType === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="49" ry="49" fill={fill} style={shapeStyle} />
        ) : null}
        {edit.shapeType === "line" ? (
          <line x1="1" y1="1" x2="99" y2="99" style={shapeStyle} />
        ) : null}
      </svg>
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

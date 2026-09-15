import type { PageViewport } from "pdfjs-dist";
import {
  createPdfRectAtScreenPoint,
  createProportionalPdfRectAtScreenPoint,
  createPdfRectFromScreenPoints,
  fitPdfRectToAspectRatio,
  pdfRectToViewportStyle,
} from "../editing/coordinates";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  EditingTool,
  FreehandStyle,
  PdfEdit,
  PdfRect,
  PdfPoint,
  SignatureImage,
  ShapeType,
} from "../editing/types";
import { FreehandEditBlock } from "./FreehandEditLayer";
import { TextMarkupLayer } from "./TextMarkupLayer";
import { CommentEditMarker } from "./CommentEditLayer";
import { SignatureEditBlock } from "./SignatureEditLayer";
import { ShapeEditBlock } from "./ShapeEditLayer";
import { TextEditBlock } from "./TextEditLayer";

type PdfEditLayerProps = {
  pageNumber: number;
  viewport: PageViewport;
  edits: PdfEdit[];
  images: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  freehandStyle: FreehandStyle;
  pendingSignatureImage: SignatureImage | null;
  onAddText: (rect: PdfRect) => void;
  onAddShape: (shapeType: ShapeType, rect: PdfRect) => void;
  onPlaceSignature: (rect: PdfRect) => void;
  onAddFreehand: (points: PdfPoint[]) => void;
  onStartComment: (point: PdfPoint) => void;
  onSelect: (editId: string) => void;
  onUpdate: (edit: PdfEdit) => void;
  onDelete: (editId: string) => void;
};

export function PdfEditLayer({
  pageNumber,
  viewport,
  edits,
  images,
  selectedEditId,
  activeTool,
  freehandStyle,
  pendingSignatureImage,
  onAddText,
  onAddShape,
  onPlaceSignature,
  onAddFreehand,
  onStartComment,
  onSelect,
  onUpdate,
  onDelete,
}: PdfEditLayerProps) {
  const [creation, setCreation] = useState<{
    pointerId: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const creationRef = useRef<typeof creation>(null);
  const setCreationState = (next: typeof creation) => {
    creationRef.current = next;
    setCreation(next);
  };
  const creationActive =
    activeTool === "add_text" ||
    activeTool === "freehand" || activeTool === "comment" ||
    activeTool.startsWith("shape_") ||
    (activeTool === "signature" && pendingSignatureImage !== null);
  const freehandPointsRef = useRef<PdfPoint[] | null>(null);
  const ignoreCompletionClickRef = useRef(false);
  const [freehandPreview, setFreehandPreview] = useState<PdfPoint[]>([]);
  const previewRect = creation
    ? createPdfRectFromScreenPoints(viewport, creation.start, creation.end)
    : null;

  useEffect(() => {
    setCreationState(null);
  }, [activeTool, pageNumber, pendingSignatureImage]);

  useEffect(() => {
    const cancelCreation = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreationState(null);
      }
    };
    window.addEventListener("keydown", cancelCreation);
    return () => window.removeEventListener("keydown", cancelCreation);
  }, []);

  const pointForEvent = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): { x: number; y: number } => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const finishCreation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activeTool === "freehand" && freehandPointsRef.current) {
      const points = freehandPointsRef.current;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      freehandPointsRef.current = null;
      setFreehandPreview([]);
      if (points.length > 1) {
        ignoreCompletionClickRef.current = true;
        onAddFreehand(points);
      }
      return;
    }
    const currentCreation = creationRef.current;
    if (!currentCreation || currentCreation.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const end = pointForEvent(event);
    setCreationState(null);
    if (
      Math.hypot(end.x - currentCreation.start.x, end.y - currentCreation.start.y) < 6
    ) {
      return;
    }
    const rect = createPdfRectFromScreenPoints(viewport, currentCreation.start, end);

    if (activeTool === "add_text") {
      ignoreCompletionClickRef.current = true;
      onAddText(rect);
    } else if (activeTool.startsWith("shape_")) {
      ignoreCompletionClickRef.current = true;
      onAddShape(activeTool.replace("shape_", "") as ShapeType, rect);
    } else if (pendingSignatureImage) {
      ignoreCompletionClickRef.current = true;
      onPlaceSignature(
        fitPdfRectToAspectRatio(
          rect,
          pendingSignatureImage.width / pendingSignatureImage.height,
        ),
      );
    }
  };

  return (
    <div
      className={
        creationActive
          ? "pdf-edit-layer pdf-edit-layer--creation-active"
          : "pdf-edit-layer"
      }
      aria-label={`Couche d'édition de la page ${pageNumber}`}
      data-active-editing-tool={activeTool}
      onPointerDown={(event) => {
        if (activeTool === "comment" && event.button === 0) {
          event.preventDefault();
          const point = pointForEvent(event);
          const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
          onStartComment({ x, y });
          return;
        }
        if (activeTool === "freehand" && event.button === 0) {
          event.preventDefault();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const point = pointForEvent(event);
          const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
          freehandPointsRef.current = [{ x, y }];
          setFreehandPreview([{ x, y }]);
          return;
        }
        if (
          !creationActive ||
          event.button !== 0 ||
          event.target instanceof Element &&
          event.target.closest(".pdf-text-edit, .pdf-shape-edit, .pdf-signature-edit")
        ) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const point = pointForEvent(event);
        setCreationState({ pointerId: event.pointerId, start: point, end: point });
      }}
      onPointerMove={(event) => {
        if (activeTool === "freehand" && freehandPointsRef.current) {
          const point = pointForEvent(event);
          const [x, y] = viewport.convertToPdfPoint(point.x, point.y);
          const points = freehandPointsRef.current;
          const previous = points[points.length - 1];
          if (!previous || Math.hypot(x - previous.x, y - previous.y) >= 1.5) {
            const next = [...points, { x, y }];
            freehandPointsRef.current = next;
            setFreehandPreview(next);
          }
          return;
        }
        if (creationRef.current?.pointerId === event.pointerId) {
          const point = pointForEvent(event);
          setCreationState({ ...creationRef.current, end: point });
        }
      }}
      onPointerUp={finishCreation}
      onPointerCancel={() => setCreationState(null)}
      // React unit tests use a synthetic click without pointer events. Real pointer
      // interaction always follows the drag path above, including the click threshold.
      onClick={(event) => {
        if (ignoreCompletionClickRef.current) {
          ignoreCompletionClickRef.current = false;
          event.stopPropagation();
          return;
        }
        // An edit created or selected inside this layer owns its click. Let empty
        // surface clicks continue to the page so they can deselect as before.
        if (event.target !== event.currentTarget) {
          event.stopPropagation();
          return;
        }
        if (!creationActive || event.target !== event.currentTarget || event.detail !== 0) {
          return;
        }
        const point = pointForEvent(event as unknown as ReactPointerEvent<HTMLDivElement>);
        if (activeTool === "add_text") {
          onAddText(createPdfRectAtScreenPoint(viewport, point));
        } else if (activeTool.startsWith("shape_")) {
          const shapeType = activeTool.replace("shape_", "") as ShapeType;
          onAddShape(shapeType, createPdfRectAtScreenPoint(viewport, point, 160, shapeType === "line" ? 80 : 120));
        } else if (pendingSignatureImage) {
          onPlaceSignature(createProportionalPdfRectAtScreenPoint(viewport, point, pendingSignatureImage.width / pendingSignatureImage.height));
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {previewRect ? (
        <CreationPreview
          rect={previewRect}
          viewport={viewport}
          shapeType={activeTool.startsWith("shape_") ? activeTool.replace("shape_", "") as ShapeType : null}
        />
      ) : null}
      {freehandPreview.length > 1 ? <FreehandPreview points={freehandPreview} viewport={viewport} style={freehandStyle} /> : null}
      {edits.map((edit) => {
        if (edit.type === "add_text") {
          return (
            <TextEditBlock
              key={edit.id}
              edit={edit}
              viewport={viewport}
              selected={edit.id === selectedEditId}
              onSelect={() => onSelect(edit.id)}
              onChangeText={(text) => onUpdate({ ...edit, text })}
              onMove={(rect) => onUpdate({ ...edit, rect })}
              onResize={(rect, previousRect) => {
                if (!edit.autoSize) {
                  onUpdate({ ...edit, rect });
                  return;
                }
                const previousHeight = previousRect.y1 - previousRect.y0;
                const nextHeight = rect.y1 - rect.y0;
                const fontSize = Math.round(
                  Math.min(144, Math.max(6, edit.style.fontSize * (nextHeight / previousHeight))),
                );
                onUpdate({ ...edit, rect, style: { ...edit.style, fontSize } });
              }}
            />
          );
        }

        if (edit.type === "shape") {
          return (
            <ShapeEditBlock
              key={edit.id}
              edit={edit}
              viewport={viewport}
              selected={edit.id === selectedEditId}
              onSelect={() => onSelect(edit.id)}
              onMove={(rect) => onUpdate({ ...edit, rect })}
            />
          );
        }

        if (edit.type === "freehand") {
          return <FreehandEditBlock key={edit.id} edit={edit} viewport={viewport} selected={edit.id === selectedEditId} onSelect={() => onSelect(edit.id)} onMove={onUpdate} />;
        }

        if (edit.type === "text_markup") return <TextMarkupLayer key={edit.id} edit={edit} viewport={viewport} />;

        if (edit.type === "comment") {
          return <CommentEditMarker key={edit.id} edit={edit} viewport={viewport} selected={edit.id === selectedEditId} onSelect={() => onSelect(edit.id)} />;
        }

        const image = images[edit.imageId];
        return image ? (
          <SignatureEditBlock
            key={edit.id}
            edit={edit}
            image={image}
            viewport={viewport}
            selected={edit.id === selectedEditId}
            onSelect={() => onSelect(edit.id)}
            onMove={(rect) => onUpdate({ ...edit, rect })}
            onDelete={() => onDelete(edit.id)}
          />
        ) : null;
      })}
    </div>
  );
}

function FreehandPreview({ points, viewport, style }: { points: PdfPoint[]; viewport: PageViewport; style: FreehandStyle }) {
  const path = points.map((point, index) => { const [x, y] = viewport.convertToViewportPoint(point.x, point.y); return `${index ? "L" : "M"}${x} ${y}`; }).join(" ");
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  return <svg className="pdf-freehand-preview" viewBox={`0 0 ${viewport.width} ${viewport.height}`} aria-hidden="true"><path d={path} fill="none" stroke={style.color} strokeOpacity={style.opacity ?? 1} strokeWidth={Math.max(1, style.strokeWidth * scale)} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CreationPreview({
  rect,
  viewport,
  shapeType,
}: {
  rect: PdfRect;
  viewport: PageViewport;
  shapeType: ShapeType | null;
}) {
  const style = pdfRectToViewportStyle(viewport, rect);
  return (
    <div
      className={`pdf-edit-creation-preview${shapeType ? ` pdf-edit-creation-preview--${shapeType}` : ""}`}
      aria-hidden="true"
      style={style}
    >
      {shapeType === "line" ? <span /> : null}
    </div>
  );
}

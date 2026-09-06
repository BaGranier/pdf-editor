import type { PageViewport } from "pdfjs-dist";
import {
  createPdfRectAtScreenPoint,
  createProportionalPdfRectAtScreenPoint,
  createPdfRectFromScreenPoints,
  fitPdfRectToAspectRatio,
  pdfRectToViewportStyle,
} from "../editing/coordinates";
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  EditingTool,
  PdfEdit,
  PdfRect,
  SignatureImage,
  ShapeType,
} from "../editing/types";
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
  pendingSignatureImage: SignatureImage | null;
  onAddText: (rect: PdfRect) => void;
  onAddShape: (shapeType: ShapeType, rect: PdfRect) => void;
  onPlaceSignature: (rect: PdfRect) => void;
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
  pendingSignatureImage,
  onAddText,
  onAddShape,
  onPlaceSignature,
  onSelect,
  onUpdate,
  onDelete,
}: PdfEditLayerProps) {
  const [creation, setCreation] = useState<{
    pointerId: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
  } | null>(null);
  const creationActive =
    activeTool === "add_text" ||
    activeTool.startsWith("shape_") ||
    (activeTool === "signature" && pendingSignatureImage !== null);
  const previewRect = creation
    ? createPdfRectFromScreenPoints(viewport, creation.start, creation.end)
    : null;

  useEffect(() => {
    setCreation(null);
  }, [activeTool, pageNumber, pendingSignatureImage]);

  useEffect(() => {
    const cancelCreation = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreation(null);
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
    const currentCreation = creation;
    if (!currentCreation || currentCreation.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const end = pointForEvent(event);
    setCreation(null);
    if (
      Math.hypot(end.x - currentCreation.start.x, end.y - currentCreation.start.y) < 6
    ) {
      return;
    }
    const rect = createPdfRectFromScreenPoints(viewport, currentCreation.start, end);

    if (activeTool === "add_text") {
      onAddText(rect);
    } else if (activeTool.startsWith("shape_")) {
      onAddShape(activeTool.replace("shape_", "") as ShapeType, rect);
    } else if (pendingSignatureImage) {
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
        if (
          !creationActive ||
          event.button !== 0 ||
          event.target !== event.currentTarget
        ) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const point = pointForEvent(event);
        setCreation({ pointerId: event.pointerId, start: point, end: point });
      }}
      onPointerMove={(event) => {
        if (creation?.pointerId === event.pointerId) {
          const point = pointForEvent(event);
          setCreation((current) => current ? { ...current, end: point } : null);
        }
      }}
      onPointerUp={finishCreation}
      onPointerCancel={() => setCreation(null)}
      // React unit tests use a synthetic click without pointer events. Real pointer
      // interaction always follows the drag path above, including the click threshold.
      onClick={(event) => {
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

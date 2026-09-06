import type { PageViewport } from "pdfjs-dist";
import {
  createPdfRectAtScreenPoint,
  createProportionalPdfRectAtScreenPoint,
} from "../editing/coordinates";
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
  const creationActive =
    activeTool === "add_text" ||
    activeTool.startsWith("shape_") ||
    (activeTool === "signature" && pendingSignatureImage !== null);

  return (
    <div
      className={
        creationActive
          ? "pdf-edit-layer pdf-edit-layer--creation-active"
          : "pdf-edit-layer"
      }
      aria-label={`Couche d'édition de la page ${pageNumber}`}
      data-active-editing-tool={activeTool}
      onClick={(event) => {
        if (!creationActive || event.target !== event.currentTarget) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        const point = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };

        if (activeTool === "add_text") {
          onAddText(createPdfRectAtScreenPoint(viewport, point));
        } else if (activeTool.startsWith("shape_")) {
          const shapeType = activeTool.replace("shape_", "") as ShapeType;
          onAddShape(
            shapeType,
            createPdfRectAtScreenPoint(
              viewport,
              point,
              160,
              shapeType === "line" ? 80 : 120,
            ),
          );
        } else if (pendingSignatureImage) {
          onPlaceSignature(
            createProportionalPdfRectAtScreenPoint(
              viewport,
              point,
              pendingSignatureImage.width / pendingSignatureImage.height,
            ),
          );
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
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

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  pdfRectToViewportStyle,
  resizePdfRectByScreenDelta,
  resizeFreeformPdfRectByScreenDelta,
  translatePdfRectByScreenDelta,
} from "../editing/coordinates";
import type {
  PdfRect,
  SignatureEdit,
  ImageEdit,
  SignatureImage,
  ImageCrop,
} from "../editing/types";
import { FULL_IMAGE_CROP, croppedImageRect } from "../images/crop";
import { ImageCropEditor } from "./ImageCropEditor";

type SignatureEditBlockProps = {
  edit: SignatureEdit | ImageEdit;
  image: SignatureImage;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onMove: (rect: PdfRect) => void;
  onDelete: () => void;
  onCrop?: (crop: ImageCrop | undefined, rect: PdfRect) => void;
};

export function SignatureEditBlock({
  edit,
  image,
  viewport,
  selected,
  onSelect,
  onMove,
  onDelete,
  onCrop,
}: SignatureEditBlockProps) {
  const [cropping, setCropping] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const crop = edit.type === "image" ? edit.crop ?? FULL_IMAGE_CROP : FULL_IMAGE_CROP;
  const fullRect = croppedImageRect(edit.rect, crop, FULL_IMAGE_CROP);
  const interactionRef = useRef<{
    kind: "move" | "resize" | "width" | "height";
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const [draftRect, setDraftRect] = useState(edit.rect);
  const interactionRectRef = useRef(edit.rect);
  const style = pdfRectToViewportStyle(viewport, cropping ? fullRect : draftRect);
  const aspectRatio = (edit.rect.x1 - edit.rect.x0) / (edit.rect.y1 - edit.rect.y0);

  useEffect(() => { if (!selected) setCropping(false); }, [selected]);

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
      let resizeDelta = delta;
      if (interaction.kind === "width" || interaction.kind === "height") {
        const [a, b, c, d] = viewport.transform;
        const determinant = a * d - b * c;
        const px = (d * delta.x - c * delta.y) / determinant;
        const py = (a * delta.y - b * delta.x) / determinant;
        resizeDelta = interaction.kind === "width" ? { x: a * px, y: b * px } : { x: c * py, y: d * py };
      }
      const rect =
        interaction.kind === "move"
          ? translatePdfRectByScreenDelta(viewport, interaction.rect, delta)
          : edit.type === "signature" || event.shiftKey || (edit.aspectLocked ?? true)
            ? resizePdfRectByScreenDelta(
              viewport,
              interaction.rect,
              resizeDelta,
              aspectRatio,
            ) : resizeFreeformPdfRectByScreenDelta(viewport, interaction.rect,
              resizeDelta, "se", 10, 10);
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
  }, [aspectRatio, onMove, viewport, edit]);

  const startInteraction = (
    kind: "move" | "resize" | "width" | "height",
    event: ReactMouseEvent<HTMLElement>,
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
      clientX: event.clientX,
      clientY: event.clientY,
      rect: edit.rect,
    };
  };

  return (
    <div
      ref={rootRef}
      className={selected ? "pdf-signature-edit is-selected" : "pdf-signature-edit"}
      data-signature-edit-id={edit.type === "signature" ? edit.id : undefined}
      data-image-edit-id={edit.type === "image" ? edit.id : undefined}
      tabIndex={0}
      onFocus={onSelect}
      onPointerDown={(event) => {
        // Keep the release click on the image when a moving handle leaves the
        // original hit area. Otherwise the page receives it and clears selection.
        if (!cropping && !(event.target as HTMLElement).closest(".pdf-image-actions,.pdf-signature-edit__delete")) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
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
      onMouseDown={(event) => { if (!cropping) startInteraction("move", event); }}
    >
      <div className="pdf-image-clip">
      <img
        src={image.dataUrl}
        alt={`${edit.type === "image" ? "Image" : "Signature visuelle"} page ${edit.page}`}
        draggable={false}
        style={edit.type === "image" && !cropping ? { position: "absolute", width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, objectFit: "fill" } : undefined}
      />
      </div>
      {cropping && onCrop ? <ImageCropEditor initial={crop} rotation={viewport.rotation} onApply={(next) => { onCrop(next, croppedImageRect(edit.rect, crop, next)); setCropping(false); rootRef.current?.focus(); }} onCancel={() => { setCropping(false); rootRef.current?.focus(); }} /> : null}
      {selected && !cropping ? (
        <>
          <button
            type="button"
            className="pdf-signature-edit__delete"
            aria-label={`Supprimer ${edit.type === "image" ? "l’image" : "la signature"} page ${edit.page}`}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            ×
          </button>
          <button
            type="button"
            className="pdf-signature-edit__resize"
            aria-label={`Redimensionner ${edit.type === "image" ? "l’image" : "la signature"} page ${edit.page}`}
            onMouseDown={(event) => startInteraction("resize", event)}
          />
          {edit.type === "image" ? <>
            <button type="button" className="pdf-image-resize-width" aria-label="Redimensionner la largeur de l’image" onMouseDown={(event) => startInteraction("width", event)} />
            <button type="button" className="pdf-image-resize-height" aria-label="Redimensionner la hauteur de l’image" onMouseDown={(event) => startInteraction("height", event)} />
            <div className="pdf-image-actions" onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" onClick={(event) => { event.stopPropagation(); setCropping(true); }}>Rogner l’image</button>
              {edit.crop ? <button type="button" onClick={(event) => { event.stopPropagation(); onCrop?.(undefined, fullRect); }}>Rétablir l’image entière</button> : null}
            </div>
          </> : null}
        </>
      ) : null}
    </div>
  );
}

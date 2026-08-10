import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  pdfRectToViewportStyle,
  resizePdfRectByScreenDelta,
  translatePdfRectByScreenDelta,
} from "../editing/coordinates";
import type {
  PdfRect,
  SignatureEdit,
  SignatureImage,
} from "../editing/types";

type SignatureEditBlockProps = {
  edit: SignatureEdit;
  image: SignatureImage;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onMove: (rect: PdfRect) => void;
  onDelete: () => void;
};

export function SignatureEditBlock({
  edit,
  image,
  viewport,
  selected,
  onSelect,
  onMove,
  onDelete,
}: SignatureEditBlockProps) {
  const interactionRef = useRef<{
    kind: "move" | "resize";
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const style = pdfRectToViewportStyle(viewport, edit.rect);
  const aspectRatio = image.width / image.height;

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
      onMove(
        interaction.kind === "move"
          ? translatePdfRectByScreenDelta(viewport, interaction.rect, delta)
          : resizePdfRectByScreenDelta(
              viewport,
              interaction.rect,
              delta,
              aspectRatio,
            ),
      );
    }

    function finishInteraction() {
      interactionRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishInteraction);
    window.addEventListener("blur", finishInteraction);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishInteraction);
      window.removeEventListener("blur", finishInteraction);
    };
  }, [aspectRatio, onMove, viewport]);

  const startInteraction = (
    kind: "move" | "resize",
    event: ReactMouseEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onSelect();
    interactionRef.current = {
      kind,
      clientX: event.clientX,
      clientY: event.clientY,
      rect: edit.rect,
    };
  };

  return (
    <div
      className={selected ? "pdf-signature-edit is-selected" : "pdf-signature-edit"}
      data-signature-edit-id={edit.id}
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
    >
      <img
        src={image.dataUrl}
        alt={`Signature visuelle page ${edit.page}`}
        draggable={false}
      />
      {selected ? (
        <>
          <button
            type="button"
            className="pdf-signature-edit__delete"
            aria-label={`Supprimer la signature page ${edit.page}`}
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
            aria-label={`Redimensionner la signature page ${edit.page}`}
            onMouseDown={(event) => startInteraction("resize", event)}
          />
        </>
      ) : null}
    </div>
  );
}

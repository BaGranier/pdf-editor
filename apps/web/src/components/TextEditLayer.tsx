import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  pdfRectToViewportStyle,
  translatePdfRectByScreenDelta,
} from "../editing/coordinates";
import type { AddTextEdit, PdfRect } from "../editing/types";

type TextEditBlockProps = {
  edit: AddTextEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
  onChangeText: (text: string) => void;
  onMove: (rect: PdfRect) => void;
};

export function TextEditBlock({
  edit,
  viewport,
  selected,
  onSelect,
  onChangeText,
  onMove,
}: TextEditBlockProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const dragRef = useRef<{
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const style = pdfRectToViewportStyle(viewport, edit.rect);

  useEffect(() => {
    if (selected) {
      inputRef.current?.focus();
    }
  }, [selected]);

  useEffect(() => {
    function handleMouseMove(event: globalThis.MouseEvent) {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      onMove(
        translatePdfRectByScreenDelta(viewport, drag.rect, {
          x: event.clientX - drag.clientX,
          y: event.clientY - drag.clientY,
        }),
      );
    }

    function finishMove() {
      dragRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", finishMove);
    window.addEventListener("blur", finishMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", finishMove);
      window.removeEventListener("blur", finishMove);
    };
  }, [onMove, viewport]);

  const startMove = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelect();
    dragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      rect: edit.rect,
    };
  };

  return (
    <div
      className={selected ? "pdf-text-edit is-selected" : "pdf-text-edit"}
      data-text-edit-id={edit.id}
      style={{
        left: style.left,
        top: style.top,
        width: style.width,
        height: style.height,
        transform: style.transform,
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <button
        type="button"
        className="pdf-text-edit__drag-handle"
        aria-label={`Déplacer le bloc de texte page ${edit.page}`}
        title="Déplacer le bloc"
        onMouseDown={startMove}
      >
        ⋮⋮
      </button>
      <textarea
        ref={inputRef}
        aria-label={`Texte ajouté page ${edit.page}`}
        value={edit.text}
        placeholder="Saisissez votre texte"
        spellCheck
        style={{
          color: edit.style.color,
          fontFamily: edit.style.fontFamily,
          fontSize: `${Math.round(edit.style.fontSize * Math.hypot(viewport.transform[0], viewport.transform[1]) * 1_000) / 1_000}px`,
          fontWeight: edit.style.bold ? 700 : 400,
        }}
        onChange={(event) => onChangeText(event.target.value)}
        onFocus={onSelect}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </div>
  );
}

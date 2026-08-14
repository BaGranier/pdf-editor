import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  getMinimumTextRectSize,
  pdfRectToViewportStyle,
  resizeFreeformPdfRectByScreenDelta,
  translatePdfRectByScreenDelta,
  type ResizeHandle,
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

const TEXT_COMMIT_DELAY_MS = 600;
export const TEXT_OVERFLOW_TOLERANCE_CSS_PX = 1;
const RESIZE_HANDLES: ResizeHandle[] = ["nw", "ne", "sw", "se"];

export function textAreaHasOverflow(input: HTMLTextAreaElement): boolean {
  return (
    input.scrollHeight - input.clientHeight > TEXT_OVERFLOW_TOLERANCE_CSS_PX ||
    input.scrollWidth - input.clientWidth > TEXT_OVERFLOW_TOLERANCE_CSS_PX
  );
}

export function TextEditBlock({
  edit,
  viewport,
  selected,
  onSelect,
  onChangeText,
  onMove,
}: TextEditBlockProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const overflowTooltipId = useId();
  const [draftText, setDraftText] = useState(edit.text);
  const [draftRect, setDraftRect] = useState(edit.rect);
  const [hasOverflow, setHasOverflow] = useState(false);
  const draftTextRef = useRef(edit.text);
  const committedTextRef = useRef(edit.text);
  const textDirtyRef = useRef(false);
  const textTimerRef = useRef<number | null>(null);
  const onChangeTextRef = useRef(onChangeText);
  const interactionRef = useRef<{
    kind: "move" | "resize";
    handle?: ResizeHandle;
    clientX: number;
    clientY: number;
    rect: PdfRect;
  } | null>(null);
  const interactionRectRef = useRef(edit.rect);
  const style = pdfRectToViewportStyle(viewport, draftRect);
  const minimumSize = getMinimumTextRectSize(edit.style.fontSize);

  onChangeTextRef.current = onChangeText;

  const commitText = useCallback(() => {
    if (textTimerRef.current !== null) {
      window.clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
    if (!textDirtyRef.current || draftTextRef.current === committedTextRef.current) {
      textDirtyRef.current = false;
      return;
    }
    textDirtyRef.current = false;
    committedTextRef.current = draftTextRef.current;
    onChangeTextRef.current(draftTextRef.current);
  }, []);

  useEffect(() => {
    if (!textDirtyRef.current) {
      draftTextRef.current = edit.text;
      committedTextRef.current = edit.text;
      setDraftText(edit.text);
    }
  }, [edit.id, edit.text]);

  useEffect(() => {
    if (!interactionRef.current) {
      interactionRectRef.current = edit.rect;
      setDraftRect(edit.rect);
    }
  }, [edit.id, edit.rect]);

  useEffect(() => {
    if (selected && edit.text.length === 0) {
      inputRef.current?.focus();
    }
  }, [edit.id, edit.text.length, selected]);

  const measureOverflow = useCallback(() => {
    const input = inputRef.current;
    if (input) {
      const nextHasOverflow = textAreaHasOverflow(input);
      setHasOverflow((currentHasOverflow) =>
        currentHasOverflow === nextHasOverflow
          ? currentHasOverflow
          : nextHasOverflow,
      );
    }
  }, []);

  useLayoutEffect(() => {
    measureOverflow();
  }, [draftRect, draftText, edit.style, measureOverflow, viewport]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measureOverflow);
    resizeObserver?.observe(input);

    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", measureOverflow);
    void fonts?.ready.then(measureOverflow);

    return () => {
      resizeObserver?.disconnect();
      fonts?.removeEventListener("loadingdone", measureOverflow);
    };
  }, [measureOverflow]);

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
              minimumSize.width,
              minimumSize.height,
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
  }, [minimumSize.height, minimumSize.width, onMove, viewport]);

  useEffect(
    () => () => {
      if (textTimerRef.current !== null) {
        window.clearTimeout(textTimerRef.current);
      }
      if (textDirtyRef.current && draftTextRef.current !== committedTextRef.current) {
        onChangeTextRef.current(draftTextRef.current);
      }
    },
    [],
  );

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
    inputRef.current?.blur();
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

  return (
    <div
      className={`${selected ? "pdf-text-edit is-selected" : "pdf-text-edit"}${hasOverflow ? " has-overflow" : ""}`}
      data-text-edit-id={edit.id}
      data-text-overflow={hasOverflow ? "true" : "false"}
      aria-describedby={hasOverflow ? overflowTooltipId : undefined}
      title={
        hasOverflow
          ? "Le texte dépasse de cette zone. Agrandissez la zone ou réduisez la taille du texte."
          : undefined
      }
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
        onMouseDown={(event) => startInteraction("move", event)}
      >
        ⋮⋮
      </button>
      <textarea
        ref={inputRef}
        aria-label={`Texte ajouté page ${edit.page}`}
        value={draftText}
        placeholder="Saisissez votre texte"
        spellCheck
        style={{
          color: edit.style.color,
          fontFamily: edit.style.fontFamily,
          fontSize: `${Math.round(edit.style.fontSize * Math.hypot(viewport.transform[0], viewport.transform[1]) * 1_000) / 1_000}px`,
          fontWeight: edit.style.bold ? 700 : 400,
        }}
        onChange={(event) => {
          const text = event.target.value;
          draftTextRef.current = text;
          textDirtyRef.current = true;
          setDraftText(text);
          if (textTimerRef.current !== null) {
            window.clearTimeout(textTimerRef.current);
          }
          textTimerRef.current = window.setTimeout(commitText, TEXT_COMMIT_DELAY_MS);
        }}
        onBlur={commitText}
        onFocus={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.blur();
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      />
      {hasOverflow ? (
        <span
          id={overflowTooltipId}
          className="pdf-text-edit__overflow-tooltip"
          role="tooltip"
        >
          Le texte dépasse de cette zone. Agrandissez la zone ou réduisez la
          taille du texte.
        </span>
      ) : null}
      {selected
        ? RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              className={`pdf-text-edit__resize pdf-text-edit__resize--${handle}`}
              aria-label={`Redimensionner le bloc de texte depuis ${handle}`}
              data-resize-handle={handle}
              onMouseDown={(event) => startInteraction("resize", event, handle)}
            />
          ))
        : null}
    </div>
  );
}

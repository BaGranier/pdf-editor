import type { PageViewport } from "pdfjs-dist";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { PdfCommentEdit } from "../editing/types";

export function CommentEditMarker({ edit, viewport, selected, onSelect }: {
  edit: PdfCommentEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
}) {
  if (edit.appearanceHidden && !selected) return null;
  const marker = edit.rects?.[0];
  const style = pdfRectToViewportStyle(viewport, marker ?? edit.rect);
  return <>{edit.source === "local" && edit.rects?.map((rect, index) => (
    <span key={index} className="pdf-comment-anchor" style={pdfRectToViewportStyle(viewport, rect)} />
  ))}<button
    type="button"
    className={`pdf-comment-marker${edit.source === "local" ? " pdf-comment-marker--local" : ""}${selected ? " is-selected" : ""}`}
    data-comment-id={edit.id}
    style={marker ? { ...style, left: Math.min(style.left + style.width, viewport.width - 18), width: 18, height: 18 } : style}
    aria-label={`Commentaire page ${edit.page}: ${edit.content}`}
    title={edit.content}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
  ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v10H8l-4 4V3Z" /></svg></button></>;
}

import type { PageViewport } from "pdfjs-dist";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { PdfCommentEdit } from "../editing/types";

export function CommentEditMarker({ edit, viewport, selected, onSelect }: {
  edit: PdfCommentEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
}) {
  return <button
    type="button"
    className={selected ? "pdf-comment-marker is-selected" : "pdf-comment-marker"}
    data-comment-id={edit.id}
    style={pdfRectToViewportStyle(viewport, edit.rect)}
    aria-label={`Commentaire page ${edit.page}: ${edit.content}`}
    title={edit.content}
    onPointerDown={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onSelect(); }}
  ><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v10H8l-4 4V3Z" /></svg></button>;
}

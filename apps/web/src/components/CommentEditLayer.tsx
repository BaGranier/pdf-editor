import { ToolbarIcon } from "./ToolbarIcon";
import { useLocale } from "../viewer/locale";
import type { PageViewport } from "pdfjs-dist";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { PdfCommentEdit } from "../editing/types";

export function CommentEditMarker({ edit, viewport, selected, onSelect }: {
  edit: PdfCommentEdit;
  viewport: PageViewport;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useLocale();
  const anchors = edit.rects?.map((rect) => pdfRectToViewportStyle(viewport, rect));
  const anchor = anchors?.length ? {
    top: Math.min(...anchors.map((box) => box.top)),
    right: Math.max(...anchors.map((box) => box.left + box.width)),
  } : null;
  if (edit.appearanceHidden && !selected && !anchor) return null;
  const position = anchor ? {
    left: Math.max(0, Math.min(anchor.right - 12, viewport.width - 16)),
    top: Math.max(0, anchor.top - 14),
    width: 16,
    height: 16,
  } : pdfRectToViewportStyle(viewport, edit.rect);
  return <>
    {edit.source === "local" && anchors?.map((box, index) => (
      <span key={index} className="pdf-comment-highlight" style={box} aria-hidden="true" />
    ))}
    <button
      type="button"
      className={`pdf-comment-marker${anchor ? " pdf-comment-marker--anchored" : edit.source === "local" ? " pdf-comment-marker--local" : ""}${selected ? " is-selected" : ""}`}
      data-comment-id={edit.id}
      style={position}
      aria-label={`${t("Commentaire")} page ${edit.page}: ${edit.content}`}
      title={edit.content}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
    ><ToolbarIcon name="comment" /></button>
  </>;
}

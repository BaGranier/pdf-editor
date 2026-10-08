import type { AddTextEdit, FreehandEdit, ImageEdit, PdfEdit, ShapeEdit, SignatureEdit, TextMarkupEdit, PdfCommentEdit } from "./types";

export type LayerObject = AddTextEdit | FreehandEdit | ImageEdit | ShapeEdit | SignatureEdit | TextMarkupEdit | PdfCommentEdit;
export type LayerDirection = "front" | "back" | "forward" | "backward";
export function isLayerObject(edit: PdfEdit): edit is LayerObject {
  return edit.type === "add_text" || edit.type === "freehand" || edit.type === "image" || edit.type === "shape" || edit.type === "signature" || edit.type === "text_markup" || (edit.type === "comment" && edit.source === "local");
}
export function layerLabel(edit: LayerObject): string {
  if (edit.type === "shape") return { rectangle: "Rectangle", square: "Carré", ellipse: "Ellipse", circle: "Cercle", line: edit.lineStyle === "arrow" ? "Flèche" : "Trait" }[edit.shapeType];
  if (edit.type === "text_markup") return { highlight: "Surlignage", underline: "Soulignement", strikeout: "Barré" }[edit.kind];
  if (edit.type === "comment") return "Commentaire";
  return { add_text: "Texte", freehand: "Dessin", image: "Image", signature: "Signature graphique" }[edit.type];
}

import type { AddTextEdit, FreehandEdit, ImageEdit, PdfEdit, ShapeEdit, SignatureEdit } from "./types";

export type LayerObject = AddTextEdit | FreehandEdit | ImageEdit | ShapeEdit | SignatureEdit;
export type LayerDirection = "front" | "back" | "forward" | "backward";
export function isLayerObject(edit: PdfEdit): edit is LayerObject {
  return edit.type === "add_text" || edit.type === "freehand" || edit.type === "image" || edit.type === "shape" || edit.type === "signature";
}
export function layerLabel(edit: LayerObject): string {
  if (edit.type === "shape") return { rectangle: "Rectangle", square: "Carré", ellipse: "Ellipse", circle: "Cercle", line: edit.lineStyle === "arrow" ? "Flèche" : "Trait" }[edit.shapeType];
  return { add_text: "Texte", freehand: "Dessin", image: "Image", signature: "Signature graphique" }[edit.type];
}

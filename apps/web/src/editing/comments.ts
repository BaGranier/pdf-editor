import type { PdfCommentType } from "./types";

export function getCommentTypeLabel(type: PdfCommentType) {
  return ({
    text: "Commentaire",
    free_text: "Texte libre",
    highlight: "Surlignage",
    underline: "Soulignage",
    strikeout: "Barré",
    other: "Autre annotation",
  } as const)[type];
}

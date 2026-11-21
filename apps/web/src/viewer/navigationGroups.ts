import type { EditingTool } from "../editing/types";

export const PAGE_TOOLS = {
  organize: { id: "organize", icon: "organize", label: "Organiser" },
  read: { id: "organize", icon: "read", label: "Revenir à la lecture" },
} as const;

export const NAVIGATION_GROUPS = [
  { id: "text", label: "Texte", icon: "text", tools: [
    { id: "add_text", icon: "text", label: "Ajouter du texte" },
    { id: "edit_text", icon: "edit-text", label: "Modifier le texte existant" },
    { id: "link", icon: "link", label: "Lien" },
  ] },
  { id: "shapes", label: "Formes et images", icon: "shape", tools: [
    { id: "image", icon: "image", label: "Image" },
    { id: "freehand", icon: "freehand", label: "Dessiner" },
    { id: "shape_rectangle", icon: "rectangle", label: "Rectangle" },
    { id: "shape_square", icon: "square", label: "Carré" },
    { id: "shape_ellipse", icon: "ellipse", label: "Ellipse" },
    { id: "shape_circle", icon: "circle", label: "Cercle" },
    { id: "shape_line", icon: "line", label: "Ligne" },
    { id: "shape_arrow", icon: "arrow", label: "Flèche" },
  ] },
  { id: "marking", label: "Biffage et tampons", icon: "shield", tools: [
    { id: "redaction", icon: "redaction", label: "Biffer", description: "Biffage sécurisé : supprime les données dans la copie exportée." },
    { id: "visual_mask", icon: "visual-mask", label: "Masquage visuel", description: "Recouvre sans supprimer les données." },
    { id: "watermark", icon: "watermark", label: "Filigrane", description: "Marquage non destructif : les données restent récupérables." },
    { id: "stamp", icon: "stamp", label: "Tampon", description: "Tampon visuel, sans suppression de données." },
  ] },
  { id: "signature", label: "Signature", icon: "signature", tools: [
    { id: "signature", icon: "signature", label: "Ajouter une signature" },
  ] },
  { id: "pages", label: "Pages", icon: "organize", tools: [
    { id: "thumbnails", icon: "read", label: "Afficher les miniatures" },
    PAGE_TOOLS.organize,
  ] },
  { id: "processing", label: "Conversion", icon: "conversion", tools: [
    { id: "ocr", icon: "ocr", label: "OCR" },
    { id: "convert", icon: "conversion", label: "Convertir" },
    { id: "images_pdf", icon: "image", label: "Nouveau PDF à partir d’images" },
  ] },
  { id: "annotations", label: "Annotations", icon: "comment", tools: [
    { id: "comment", icon: "comment", label: "Commentaire" },
    { id: "comments_list", icon: "read", label: "Afficher les commentaires" },
  ] },
] as const;
export type NavigationAction = EditingTool | (typeof NAVIGATION_GROUPS)[number]["tools"][number]["id"];

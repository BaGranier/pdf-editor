export const TEXT_FONT_FAMILIES = ["Helvetica", "Times", "Courier"] as const;

export type TextFontFamily = (typeof TEXT_FONT_FAMILIES)[number];

export type PdfRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export type AddTextStyle = {
  fontFamily: TextFontFamily;
  fontSize: number;
  color: string;
  bold: boolean;
};

export const SHAPE_TYPES = ["rectangle", "ellipse", "line"] as const;

export type ShapeType = (typeof SHAPE_TYPES)[number];

export type ShapeStyle = {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string | null;
};

export const ANNOTATION_COLORS = [
  "#111827", "#374151", "#6b7280", "#d1d5db",
  "#dc2626", "#ea580c", "#eab308", "#16a34a",
  "#0d9488", "#2563eb", "#1e3a8a", "#7c3aed",
  "#db2777", "#92400e", "#ffffff",
] as const;

export type PdfPoint = { x: number; y: number };
export type FreehandStyle = { color: string; strokeWidth: number };
export type TextMarkupKind = "highlight" | "underline" | "strikeout";

export type EditingTool =
  | "select"
  | "add_text"
  | "signature"
  | "shape_rectangle"
  | "shape_ellipse"
  | "shape_line"
  | "freehand";

export type BasePdfEdit = {
  id: string;
  page: number;
  rect: PdfRect;
};

export type AddTextEdit = BasePdfEdit & {
  type: "add_text";
  text: string;
  style: AddTextStyle;
  /** True until the user explicitly chooses a font size in the inspector. */
  autoSize?: boolean;
};

export type SignatureEdit = BasePdfEdit & {
  type: "signature";
  imageId: string;
};

export type ShapeEdit = BasePdfEdit & {
  type: "shape";
  shapeType: ShapeType;
  style: ShapeStyle;
};

export type FreehandEdit = BasePdfEdit & {
  type: "freehand";
  points: PdfPoint[];
  style: FreehandStyle;
};

export type TextMarkupEdit = BasePdfEdit & {
  type: "text_markup";
  kind: TextMarkupKind;
  rects: PdfRect[];
  color: string;
};

export type PdfEdit = AddTextEdit | SignatureEdit | ShapeEdit | FreehandEdit | TextMarkupEdit;

export type SignatureImage = {
  id: string;
  mimeType: "image/png" | "image/jpeg";
  dataUrl: string;
  width: number;
  height: number;
};

export const DEFAULT_TEXT_STYLE: AddTextStyle = {
  fontFamily: "Helvetica",
  fontSize: 18,
  color: "#111827",
  bold: false,
};

export const DEFAULT_SHAPE_STYLE: ShapeStyle = {
  strokeColor: "#2563eb",
  strokeWidth: 2,
  fillColor: null,
};

export const DEFAULT_FREEHAND_STYLE: FreehandStyle = { color: "#2563eb", strokeWidth: 3 };

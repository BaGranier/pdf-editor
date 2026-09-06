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

export type EditingTool =
  | "select"
  | "add_text"
  | "signature"
  | "shape_rectangle"
  | "shape_ellipse"
  | "shape_line";

export type BasePdfEdit = {
  id: string;
  page: number;
  rect: PdfRect;
};

export type AddTextEdit = BasePdfEdit & {
  type: "add_text";
  text: string;
  style: AddTextStyle;
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

export type PdfEdit = AddTextEdit | SignatureEdit | ShapeEdit;

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

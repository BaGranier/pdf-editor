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

export type EditingTool = "select" | "add_text" | "signature";

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

export type PdfEdit = AddTextEdit | SignatureEdit;

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

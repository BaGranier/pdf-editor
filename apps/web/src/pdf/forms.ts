import type { PdfRect } from "../editing/types";

export type PdfFormFieldType = "text" | "checkbox" | "radio" | "combo" | "list" | "unsupported";

export type PdfFormField = {
  id: string;
  pageIndex: number;
  name: string;
  fieldType: PdfFormFieldType;
  value: string | string[];
  rect: PdfRect;
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
  editable: boolean;
  options: string[];
  buttonValue: string | null;
};

export async function loadPdfFormPage(
  backendUrl: string,
  file: File,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<PdfFormField[]> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("pageIndex", String(pageNumber - 1));
  const response = await fetch(`${backendUrl}/pdf/forms`, { method: "POST", body: form, signal });
  if (!response.ok) {
    let detail = "Les champs de formulaire de cette page n'ont pas pu être chargés.";
    try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* non-JSON response */ }
    throw new Error(detail);
  }
  return ((await response.json()) as { fields: PdfFormField[] }).fields;
}

import { invoke } from "@tauri-apps/api/core";

export type DocumentSource =
  | { type: "web" }
  | { type: "desktop"; documentId: string };

type NativePdfResponse = {
  documentId: string;
  fileName: string;
  bytes: number[] | Uint8Array;
};

export type DesktopPdfFile = {
  documentId: string;
  file: File;
};

export type DesktopPdfSave = {
  documentId: string;
  fileName: string;
};

// Raw IPC qualified at 27,011,971 bytes on Windows; round down to whole MiB.
export const MVP_DESKTOP_SAVE_MAX_BYTES = 25 * 1024 * 1024;
export const MVP_DESKTOP_SAVE_LIMIT_MESSAGE = "Ce document dépasse la taille validée pour la version Preview (25 Mio). Le fichier source n’a pas été modifié. Cette limitation sera levée dans une prochaine version.";
export class PreviewSaveLimitError extends Error {
  constructor() { super(MVP_DESKTOP_SAVE_LIMIT_MESSAGE); this.name = "PreviewSaveLimitError"; }
}

function validateSaveSize(content: Blob) {
  markSavePhase("blob", content.size);
  if (content.size > MVP_DESKTOP_SAVE_MAX_BYTES) {
    markSavePhase("limited", content.size);
    throw new PreviewSaveLimitError();
  }
}

function markSavePhase(phase: string, bytes: number) {
  const name = `pdf-save-${phase}`;
  performance.clearMarks?.(name);
  performance.mark?.(name, { detail: { bytes } });
}

function desktopFileError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(typeof error === "string" ? error : "L’opération fichier Desktop a échoué.");
}

function toDesktopPdfFile(response: NativePdfResponse): DesktopPdfFile {
  return {
    documentId: response.documentId,
    file: new File([new Uint8Array(response.bytes)], response.fileName, {
      type: "application/pdf",
    }),
  };
}

/**
 * The path itself never crosses the IPC boundary. Rust owns it after a user
 * selects a file and this module only holds its opaque document identifier.
 */
export async function openDesktopPdf(): Promise<DesktopPdfFile | null> {
  const response = await invoke<NativePdfResponse | null>("open_pdf");
  return response ? toDesktopPdfFile(response) : null;
}

export async function getDesktopStartupPdfs(): Promise<DesktopPdfFile[]> {
  const responses = await invoke<NativePdfResponse[]>("get_startup_pdfs");
  return responses.map(toDesktopPdfFile);
}

export async function saveDesktopPdf(
  documentId: string,
  content: Blob,
): Promise<DesktopPdfSave> {
  validateSaveSize(content);
  const bytes = new Uint8Array(await content.arrayBuffer());
  markSavePhase("invoke", bytes.byteLength);
  return invoke<DesktopPdfSave>("save_pdf", bytes, {
    headers: { "x-document-id": documentId },
  }).catch((error: unknown) => { throw desktopFileError(error); });
}

export async function saveDesktopPdfAs(
  suggestedName: string,
  content: Blob,
): Promise<DesktopPdfSave | null> {
  validateSaveSize(content);
  const bytes = new Uint8Array(await content.arrayBuffer());
  markSavePhase("invoke", bytes.byteLength);
  return invoke<DesktopPdfSave | null>("save_pdf_as", bytes, {
    headers: { "x-pdf-name": encodeURIComponent(suggestedName) },
  }).catch((error: unknown) => { throw desktopFileError(error); });
}

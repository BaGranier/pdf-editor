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
  return invoke<DesktopPdfSave>("save_pdf", {
    documentId,
    content: new Uint8Array(await content.arrayBuffer()),
  });
}

export async function saveDesktopPdfAs(
  suggestedName: string,
  content: Blob,
): Promise<DesktopPdfSave | null> {
  return invoke<DesktopPdfSave | null>("save_pdf_as", {
    suggestedName,
    content: new Uint8Array(await content.arrayBuffer()),
  });
}

import { getDownloadFileName } from "../ocr/ocr";

export type PdfExportWarning = {
  type: "text_overflow";
  editId: string;
  page: number;
  rendering: "expanded" | "partial";
} | { type: "redaction_rasterized"; page: number };

export type ExecutePdfExportInput = {
  backendUrl: string;
  formData: FormData;
  fallbackFileName: string;
  fetchImpl?: typeof fetch;
  readBodyAsArrayBuffer?: boolean;
};

export type ExecutePdfExportResult =
  | {
      ok: true;
      pdfBlob: Blob;
      downloadedName: string;
      outputStatus: string | null;
      outputWarning: string | null;
      warnings: PdfExportWarning[];
    }
  | { ok: false; kind: "network" | "backend"; message: string };

export function parsePdfExportWarnings(value: string | null): PdfExportWarning[] {
  if (!value) {
    return [];
  }

  try {
    const warnings: unknown = JSON.parse(value);
    return Array.isArray(warnings)
      ? warnings.filter(
          (warning): warning is PdfExportWarning =>
            typeof warning === "object" &&
            warning !== null &&
            Number.isInteger(warning.page) && warning.page > 0 &&
            (warning.type === "redaction_rasterized" ||
              (warning.type === "text_overflow" && typeof warning.editId === "string" &&
                ["expanded", "partial"].includes(warning.rendering))),
        )
      : [];
  } catch {
    return [];
  }
}

/** Executes the single export endpoint and normalizes its transport response. */
export async function executePdfExport(
  input: ExecutePdfExportInput,
): Promise<ExecutePdfExportResult> {
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${input.backendUrl}/pdf/export/organize`,
      { method: "POST", body: input.formData },
    );

    if (!response.ok) {
      let detail = "Le PDF modifié n'a pas pu être exporté.";
      try {
        const errorBody = (await response.json()) as { detail?: string };
        detail = errorBody.detail ?? detail;
      } catch {
        // The backend may return an empty or non-JSON error response.
      }
      return { ok: false, kind: "backend", message: detail };
    }

    // WebView2 can fail while materializing a successful PDF response as a
    // Blob. Reading its bytes first avoids that response body path.
    const pdfBlob = input.readBodyAsArrayBuffer
      ? new Blob([await response.arrayBuffer()], {
          type: response.headers.get("content-type") ?? "application/pdf",
        })
      : await response.blob();
    if (await pdfBlob.slice(0, 5).text() !== "%PDF-") {
      return { ok: false, kind: "backend", message: "Le moteur n’a pas renvoyé de fichier PDF." };
    }

    return {
      ok: true,
      pdfBlob,
      downloadedName: getDownloadFileName(
        response.headers.get("content-disposition"),
        input.fallbackFileName,
      ),
      outputWarning: response.headers.get("x-pdf-output-warning"),
      outputStatus: response.headers.get("x-pdf-output-status"),
      warnings: parsePdfExportWarnings(
        response.headers.get("x-pdf-export-warnings"),
      ),
    };
  } catch (error) {
    if (error instanceof TypeError) {
      return {
        ok: false,
        kind: "network",
        message: "Backend indisponible ou erreur réseau. Vérifiez que le service PDF est démarré.",
      };
    }
    return {
      ok: false,
      kind: "backend",
      message: error instanceof Error ? error.message : "Le PDF n'a pas pu être exporté.",
    };
  }
}

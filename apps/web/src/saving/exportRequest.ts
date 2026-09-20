import { getDownloadFileName } from "../ocr/ocr";

export type PdfExportWarning = {
  type: "text_overflow";
  editId: string;
  page: number;
  rendering: "expanded" | "partial";
};

export type ExecutePdfExportInput = {
  backendUrl: string;
  formData: FormData;
  fallbackFileName: string;
  fetchImpl?: typeof fetch;
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
            (warning as Partial<PdfExportWarning>).type === "text_overflow" &&
            typeof (warning as Partial<PdfExportWarning>).editId === "string" &&
            typeof (warning as Partial<PdfExportWarning>).page === "number" &&
            ["expanded", "partial"].includes(
              String((warning as Partial<PdfExportWarning>).rendering),
            ),
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

    return {
      ok: true,
      pdfBlob: await response.blob(),
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

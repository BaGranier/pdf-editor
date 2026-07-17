export type OcrLanguages = "fra" | "eng" | "fra+eng";
export type OcrMode = "skip-text" | "force-ocr";

export type OcrOptions = {
  languages: OcrLanguages;
  mode: OcrMode;
  deskew: boolean;
};

type OcrErrorPayload = {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
};

const OCR_ERROR_MESSAGES: Record<string, string> = {
  INVALID_PDF: "Le fichier PDF ne peut pas être traité.",
  PDF_TOO_LARGE: "Le document dépasse la taille maximale autorisée.",
  PDF_PAGE_LIMIT_EXCEEDED: "Le document dépasse le nombre maximal de pages autorisé.",
  OCR_INVALID_MODE: "Le mode OCR sélectionné n'est pas valide.",
  OCR_INVALID_LANGUAGE: "La langue OCR sélectionnée n'est pas valide.",
  OCR_LANGUAGE_UNAVAILABLE: "La langue OCR demandée n'est pas disponible.",
  OCR_TOOL_UNAVAILABLE: "Le moteur OCR n'est pas disponible.",
  OCR_TIMEOUT: "Le traitement OCR a dépassé le délai autorisé.",
  OCR_FAILED: "Le moteur OCR n'a pas pu traiter le document.",
  OCR_OUTPUT_INVALID: "Le serveur n'a pas produit un PDF valide.",
};

const GENERIC_OCR_ERROR = "Le traitement OCR a échoué.";
const NETWORK_OCR_ERROR = "Impossible de contacter le moteur PDF.";

export class OcrRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "OcrRequestError";
  }
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "-")
    .trim();

  return sanitized || null;
}

export function getDownloadFileName(
  contentDisposition: string | null,
  fallbackName: string,
) {
  const extendedMatch = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(
    contentDisposition ?? "",
  );

  if (extendedMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(extendedMatch[1].trim().replace(/^"|"$/g, ""));
      return sanitizeFileName(decoded) ?? fallbackName;
    } catch {
      // Fall back to filename= or the locally generated name.
    }
  }

  const filenameMatch = /filename\s*=\s*(?:"([^"]*)"|([^;]*))/i.exec(
    contentDisposition ?? "",
  );
  const filename = filenameMatch?.[1] ?? filenameMatch?.[2];
  return (filename ? sanitizeFileName(filename) : null) ?? fallbackName;
}

export function getOcrFallbackFileName(sourceFileName: string) {
  const baseName = sourceFileName.replace(/\.pdf$/i, "") || "document";
  return `${baseName}_OCR.pdf`;
}

function getStructuredOcrError(payload: OcrErrorPayload) {
  const detail =
    payload.detail && typeof payload.detail === "object" && !Array.isArray(payload.detail)
      ? (payload.detail as OcrErrorPayload)
      : null;
  const codeValue = detail?.code ?? payload.code;
  const messageValue = detail?.message ?? payload.message;
  const code = typeof codeValue === "string" ? codeValue : undefined;
  const message = typeof messageValue === "string" ? messageValue.trim() : "";

  return {
    code,
    message: message || (code ? OCR_ERROR_MESSAGES[code] : undefined),
  };
}

async function createResponseError(response: Response) {
  try {
    const payload = (await response.json()) as OcrErrorPayload;
    const error = getStructuredOcrError(payload);
    return new OcrRequestError(error.message ?? GENERIC_OCR_ERROR, error.code);
  } catch {
    return new OcrRequestError(GENERIC_OCR_ERROR);
  }
}

async function assertPdfResponse(response: Response, blob: Blob) {
  const responseType = (
    blob.type ||
    response.headers.get("content-type") ||
    ""
  )
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (
    responseType &&
    responseType !== "application/pdf" &&
    responseType !== "application/x-pdf"
  ) {
    throw new OcrRequestError(
      OCR_ERROR_MESSAGES.OCR_OUTPUT_INVALID,
      "OCR_OUTPUT_INVALID",
    );
  }

  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (
    signature.length !== 4 ||
    signature[0] !== 0x25 ||
    signature[1] !== 0x50 ||
    signature[2] !== 0x44 ||
    signature[3] !== 0x46
  ) {
    throw new OcrRequestError(
      OCR_ERROR_MESSAGES.OCR_OUTPUT_INVALID,
      "OCR_OUTPUT_INVALID",
    );
  }
}

export async function requestOcrPdf(
  backendUrl: string,
  sourceFile: File,
  options: OcrOptions,
) {
  const formData = new FormData();
  formData.append("file", sourceFile, sourceFile.name);
  formData.append("languages", options.languages);
  formData.append("mode", options.mode);
  formData.append("deskew", String(options.deskew));

  let response: Response;

  try {
    response = await fetch(`${backendUrl.replace(/\/$/, "")}/ocr`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new OcrRequestError(NETWORK_OCR_ERROR);
  }

  if (!response.ok) {
    throw await createResponseError(response);
  }

  let blob: Blob;
  try {
    blob = await response.blob();
    await assertPdfResponse(response, blob);
  } catch (error) {
    if (error instanceof OcrRequestError) {
      throw error;
    }
    throw new OcrRequestError(NETWORK_OCR_ERROR);
  }
  const outputFileName = getDownloadFileName(
    response.headers.get("content-disposition"),
    getOcrFallbackFileName(sourceFile.name),
  );

  return new File([blob], outputFileName, { type: "application/pdf" });
}

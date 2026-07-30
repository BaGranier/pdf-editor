import { getDownloadFileName } from "../ocr/ocr";

export type ConversionTarget = "docx" | "txt" | "html" | "png" | "jpeg";
export type ConversionOcrMode = "auto" | "never" | "always";
export type ConversionLanguages = "fra" | "eng" | "fra+eng";
export type ConversionImageDpi = 96 | 150 | 300;

export type ConversionOptions = {
  targetFormat: ConversionTarget;
  languages: ConversionLanguages;
  ocrMode: ConversionOcrMode;
  pages: string;
  imageDpi: ConversionImageDpi;
  imageQuality: number;
};

export type ConversionMetadata = {
  format: ConversionTarget;
  durationMs: number | null;
  inputBytes: number | null;
  outputBytes: number;
  ocrUsed: boolean;
  pages: number[];
  warnings: string[];
  textLayer: string | null;
};

export type ConversionDownload = {
  file: File;
  metadata: ConversionMetadata;
};

type ConversionErrorPayload = {
  code?: unknown;
  message?: unknown;
  detail?: unknown;
};

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PDF: "Le fichier PDF ne peut pas être converti.",
  UNSUPPORTED_TARGET_FORMAT: "Le format demandé n'est pas pris en charge.",
  INVALID_PAGE_RANGE: "La plage de pages n'est pas valide.",
  OCR_REQUIRED: "Une reconnaissance OCR est nécessaire pour ce document.",
  CONVERSION_FAILED: "La conversion a échoué.",
  CONVERSION_TIMEOUT: "La conversion a dépassé le délai autorisé.",
  OUTPUT_TOO_LARGE: "Le résultat de conversion est trop volumineux.",
  DEPENDENCY_UNAVAILABLE: "Le moteur de conversion demandé n'est pas disponible.",
};

const MIME_TYPES: Record<ConversionTarget, string[]> = {
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  txt: ["text/plain"],
  html: ["text/html"],
  png: ["image/png", "application/zip"],
  jpeg: ["image/jpeg", "application/zip"],
};

const FALLBACK_EXTENSIONS: Record<ConversionTarget, string> = {
  docx: "docx",
  txt: "txt",
  html: "html",
  png: "png",
  jpeg: "jpg",
};

export class ConversionRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ConversionRequestError";
  }
}

function parseNumberHeader(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWarnings(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function responseError(response: Response): Promise<ConversionRequestError> {
  try {
    const payload = (await response.json()) as ConversionErrorPayload;
    const detail =
      payload.detail && typeof payload.detail === "object"
        ? (payload.detail as ConversionErrorPayload)
        : null;
    const codeValue = detail?.code ?? payload.code;
    const messageValue = detail?.message ?? payload.message;
    const code = typeof codeValue === "string" ? codeValue : undefined;
    const message =
      typeof messageValue === "string" && messageValue.trim()
        ? messageValue.trim()
        : code
          ? ERROR_MESSAGES[code]
          : undefined;
    return new ConversionRequestError(message ?? "La conversion a échoué.", code);
  } catch {
    return new ConversionRequestError("La conversion a échoué.");
  }
}

function fallbackName(sourceName: string, target: ConversionTarget): string {
  const stem = sourceName.replace(/\.pdf$/i, "") || "document";
  return `${stem}-conversion.${FALLBACK_EXTENSIONS[target]}`;
}

function normalizedMimeType(blob: Blob, response: Response): string {
  return (blob.type || response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export async function requestConversion(
  backendUrl: string,
  sourceFile: File,
  options: ConversionOptions,
): Promise<ConversionDownload> {
  const formData = new FormData();
  formData.append("file", sourceFile, sourceFile.name);
  formData.append("target_format", options.targetFormat);
  formData.append("languages", options.languages);
  formData.append("ocr_mode", options.ocrMode);
  formData.append("pages", options.pages.trim());
  formData.append("image_dpi", String(options.imageDpi));
  formData.append("image_quality", String(options.imageQuality));

  let response: Response;
  try {
    response = await fetch(`${backendUrl.replace(/\/$/, "")}/convert`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new ConversionRequestError("Impossible de contacter le moteur PDF.");
  }
  if (!response.ok) {
    throw await responseError(response);
  }

  const blob = await response.blob();
  const mimeType = normalizedMimeType(blob, response);
  if (!MIME_TYPES[options.targetFormat].includes(mimeType)) {
    throw new ConversionRequestError(
      "Le serveur a produit un type de fichier inattendu.",
      "CONVERSION_FAILED",
    );
  }
  const outputName = getDownloadFileName(
    response.headers.get("content-disposition"),
    fallbackName(sourceFile.name, options.targetFormat),
  );
  const pages = (response.headers.get("x-conversion-pages") ?? "")
    .split(",")
    .map(Number)
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0);

  return {
    file: new File([blob], outputName, { type: mimeType }),
    metadata: {
      format: options.targetFormat,
      durationMs: parseNumberHeader(response.headers.get("x-conversion-duration-ms")),
      inputBytes: parseNumberHeader(response.headers.get("x-conversion-input-bytes")),
      outputBytes:
        parseNumberHeader(response.headers.get("x-conversion-output-bytes")) ??
        blob.size,
      ocrUsed: response.headers.get("x-conversion-ocr-used") === "true",
      pages,
      warnings: parseWarnings(response.headers.get("x-conversion-warnings")),
      textLayer: response.headers.get("x-conversion-text-layer"),
    },
  };
}

export function downloadConversionFile(file: File): void {
  const downloadUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}

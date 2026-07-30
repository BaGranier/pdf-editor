import { getDownloadFileName } from "../ocr/ocr";

export type ConversionTarget = "docx" | "txt" | "html" | "png" | "jpeg";
export type ConversionOcrMode = "auto" | "never" | "always";
export type ConversionLanguages = "fra" | "eng" | "fra+eng";
export type ConversionImageDpi = 96 | 150 | 300;
export type ConversionDocxMode = "editable" | "visual";

export type ConversionOptions = {
  targetFormat: ConversionTarget;
  languages: ConversionLanguages;
  ocrMode: ConversionOcrMode;
  pages: string;
  imageDpi: ConversionImageDpi;
  imageQuality: number;
  docxMode: ConversionDocxMode;
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
  docxMode: ConversionDocxMode | null;
};

export type ConversionDownload = {
  file: File;
  metadata: ConversionMetadata;
};

export type ConversionUploadDiagnostics = {
  fileName: string;
  size: number;
  mimeType: string;
  isBlob: boolean;
  hasPdfSignature: boolean;
};

type ConversionErrorPayload = {
  code?: unknown;
  message?: unknown;
  stage?: unknown;
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
    readonly stage?: string,
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
    const stageValue = detail?.stage ?? payload.stage;
    const code = typeof codeValue === "string" ? codeValue : undefined;
    const stage = typeof stageValue === "string" ? stageValue : undefined;
    const message =
      typeof messageValue === "string" && messageValue.trim()
        ? messageValue.trim()
        : code
          ? ERROR_MESSAGES[code]
          : undefined;
    return new ConversionRequestError(
      message ?? "La conversion a échoué.",
      code,
      stage,
    );
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

export async function normalizePdfUpload(
  source: Blob,
  fallbackFileName = "document.pdf",
): Promise<{ file: File; diagnostics: ConversionUploadDiagnostics }> {
  if (!(source instanceof Blob) || source.size <= 0) {
    throw new ConversionRequestError(
      "Le document source est vide ou indisponible.",
      "INVALID_PDF",
    );
  }

  const requestedName =
    source instanceof File && source.name.trim()
      ? source.name.trim()
      : fallbackFileName.trim();
  const fileName = requestedName || "document.pdf";
  const signature = new Uint8Array(await source.slice(0, 5).arrayBuffer());
  const hasPdfSignature =
    signature.length === 5 &&
    signature[0] === 0x25 &&
    signature[1] === 0x50 &&
    signature[2] === 0x44 &&
    signature[3] === 0x46 &&
    signature[4] === 0x2d;
  if (!hasPdfSignature) {
    throw new ConversionRequestError(
      "Le document source n'est pas un PDF valide.",
      "INVALID_PDF",
    );
  }

  const file =
    source instanceof File && source.name === fileName
      ? source
      : new File([source], fileName, {
          type: source.type || "application/pdf",
        });
  return {
    file,
    diagnostics: {
      fileName: file.name,
      size: file.size,
      mimeType: file.type || "application/pdf",
      isBlob: file instanceof Blob,
      hasPdfSignature,
    },
  };
}

export async function requestConversion(
  backendUrl: string,
  source: Blob,
  options: ConversionOptions,
  sourceFileName = source instanceof File ? source.name : "document.pdf",
): Promise<ConversionDownload> {
  const { file: sourceFile } = await normalizePdfUpload(source, sourceFileName);
  const formData = new FormData();
  formData.append("file", sourceFile, sourceFile.name);
  formData.append("target_format", options.targetFormat);
  formData.append("languages", options.languages);
  formData.append("ocr_mode", options.ocrMode);
  formData.append("pages", options.pages.trim());
  formData.append("image_dpi", String(options.imageDpi));
  formData.append("image_quality", String(options.imageQuality));
  formData.append("docx_mode", options.docxMode);
  if (!(formData.get("file") instanceof Blob)) {
    throw new ConversionRequestError(
      "Le document source n'a pas pu être préparé.",
      "INVALID_PDF",
    );
  }

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
      docxMode:
        options.targetFormat === "docx"
          ? (response.headers.get(
              "x-conversion-docx-mode",
            ) as ConversionDocxMode | null) ?? options.docxMode
          : null,
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

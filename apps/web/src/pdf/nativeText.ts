import type { NativeTextEdit, NativeTextSource, PdfRect } from "../editing/types";

export type NativeTextSpan = NativeTextSource & {
  page: number;
  rect: PdfRect;
  fontWeight: number;
  fontStyle: "normal" | "italic";
};

type NativeTextResponse = { spans: NativeTextSpan[] };
const backgroundCache = new WeakMap<File, Map<string, Promise<Blob>>>();

export type NativeTextFontValidation =
  | { status: "ok" }
  | { status: "fallback"; message: string }
  | { status: "missing" | "missing-glyphs" | "not-embeddable"; message: string; fontRef: string };

type FontResource = { id: string; sha256: string; format: "ttf" | "otf"; fileName: string; dataUrl: string };

export function clearNativeTextCache(file?: File) {
  if (file) {
    backgroundCache.delete(file);
  }
}

export function loadNativeTextPage(
  backendUrl: string,
  file: File,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<NativeTextSpan[]> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("pageIndex", String(pageNumber - 1));
  return fetch(`${backendUrl}/pdf/native-text`, { method: "POST", body: form, signal }).then(async (response) => {
    if (!response.ok) {
      let detail = "Le texte natif de la page n'a pas pu être analysé.";
      try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* non-JSON response */ }
      throw new Error(detail);
    }
    return (await response.json()) as NativeTextResponse;
  }).then((response) => response.spans);
}

export async function renderNativeTextPreview(
  backendUrl: string,
  file: File,
  pageNumber: number,
  edits: NativeTextEdit[],
  rotation = 0,
  fontResources: FontResource[] = [],
) {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("plan", JSON.stringify({ pageIndex: pageNumber - 1, edits, rotation, fontResources }));
  const response = await fetch(`${backendUrl}/pdf/native-text/preview`, { method: "POST", body: form });
  if (!response.ok) {
    let detail = "L'aperçu du remplacement n'a pas pu être rendu.";
    try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* non-JSON response */ }
    throw new Error(detail);
  }
  return response.blob();
}

/**
 * Renders the page with only the source glyphs of native edits removed.  The
 * returned image is a display-only patch; the export pipeline remains the
 * authoritative PDF mutation path.  Its cache intentionally excludes draft
 * text and style so typing never causes a backend round-trip.
 */
export function renderNativeTextBackground(
  backendUrl: string,
  file: File,
  pageNumber: number,
  edits: NativeTextEdit[],
  rotation = 0,
): Promise<Blob> {
  const sourceKey = edits
    .map((edit) => edit.source.sourceFingerprint)
    .sort()
    .join(":");
  const key = `${pageNumber}:${rotation}:${sourceKey}`;
  let pageCache = backgroundCache.get(file);
  if (!pageCache) {
    pageCache = new Map();
    backgroundCache.set(file, pageCache);
  }
  const existing = pageCache.get(key);
  if (existing) return existing;
  const request = renderNativeTextPreview(
    backendUrl,
    file,
    pageNumber,
    edits.map((edit) => ({ ...edit, text: "" })),
    rotation,
  );
  pageCache.set(key, request);
  request.catch(() => pageCache?.delete(key));
  return request;
}

function validationMessage(detail: string, fontRef: string): NativeTextFontValidation {
  if (/glyphes nécessaires/i.test(detail)) return { status: "missing-glyphs", message: detail, fontRef };
  if (/ne peut pas être réutilisée|n'est pas exportable|variante de police/i.test(detail)) return { status: "not-embeddable", message: detail, fontRef };
  return { status: "missing", message: detail, fontRef };
}

/** Validates exactly the insertion path used by export without persisting a PDF. */
export async function validateNativeTextFont(
  backendUrl: string,
  file: File,
  pageNumber: number,
  edit: NativeTextEdit,
  fontResources: FontResource[] = [],
): Promise<NativeTextFontValidation> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("plan", JSON.stringify({ pageIndex: pageNumber - 1, edit, fontResources }));
  const response = await fetch(`${backendUrl}/pdf/native-text/font-validation`, { method: "POST", body: form });
  if (response.ok) {
    return edit.fontFallbackReason ? { status: "fallback", message: edit.fontFallbackReason } : { status: "ok" };
  }
  let detail = "La police sélectionnée ne peut pas être utilisée pour l'export PDF.";
  try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* non-JSON response */ }
  return validationMessage(detail, edit.style.fontRef ?? edit.style.fontFamily);
}

import type { NativeTextEdit, NativeTextSource, PdfRect } from "../editing/types";

export type NativeTextSpan = NativeTextSource & {
  page: number;
  rect: PdfRect;
  fontWeight: number;
  fontStyle: "normal" | "italic";
};

type NativeTextResponse = { spans: NativeTextSpan[] };
const cache = new WeakMap<File, Map<number, Promise<NativeTextSpan[]>>>();

export function clearNativeTextCache(file?: File) {
  if (file) cache.delete(file);
}

export function loadNativeTextPage(
  backendUrl: string,
  file: File,
  pageNumber: number,
): Promise<NativeTextSpan[]> {
  let pageCache = cache.get(file);
  if (!pageCache) {
    pageCache = new Map();
    cache.set(file, pageCache);
  }
  const existing = pageCache.get(pageNumber);
  if (existing) return existing;
  const request = (async () => {
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("pageIndex", String(pageNumber - 1));
    const response = await fetch(`${backendUrl}/pdf/native-text`, { method: "POST", body: form });
    if (!response.ok) {
      let detail = "Le texte natif de la page n'a pas pu être analysé.";
      try { detail = ((await response.json()) as { detail?: string }).detail ?? detail; } catch { /* non-JSON response */ }
      throw new Error(detail);
    }
    return ((await response.json()) as NativeTextResponse).spans;
  })();
  pageCache.set(pageNumber, request);
  request.catch(() => pageCache?.delete(pageNumber));
  return request;
}

export async function renderNativeTextPreview(
  backendUrl: string,
  file: File,
  pageNumber: number,
  edits: NativeTextEdit[],
  rotation = 0,
  fontResources: Array<{ id: string; sha256: string; format: "ttf" | "otf"; fileName: string; dataUrl: string }> = [],
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

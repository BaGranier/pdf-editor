import type { PdfEdit, PdfRect, RedactionEdit } from "./types";
import { searchPdfPage, type PdfSearchHit, type PdfSearchOptions } from "../pdf/search";
import { getCustomFont } from "../fonts/fontRegistry";

export type IndexedGlyph = [string, [number, number, number, number]];
export type IndexedLine = IndexedGlyph[];
export type IndexedPage = { page: number; native: IndexedLine[]; ocr: IndexedLine[]; issue: string | null };

export function glyphRect([, [x0, y0, x1, y1]]: IndexedGlyph): PdfRect {
  return { x0, y0, x1, y1 };
}

export function coveringRect(rects: PdfRect[]): PdfRect {
  return rects.slice(1).reduce((box, rect) => ({
    x0: Math.min(box.x0, rect.x0), y0: Math.min(box.y0, rect.y0),
    x1: Math.max(box.x1, rect.x1), y1: Math.max(box.y1, rect.y1),
  }), rects[0]);
}

function containsCenter(zone: PdfRect, box: PdfRect) {
  const x = (box.x0 + box.x1) / 2, y = (box.y0 + box.y1) / 2;
  return x >= zone.x0 && x <= zone.x1 && y >= zone.y0 && y <= zone.y1;
}

export function indexedLines(page: IndexedPage, zones: RedactionEdit[]) {
  if (!zones.length) return [...page.native, ...page.ocr];
  const lines: IndexedLine[] = [];
  for (const line of [...page.native, ...page.ocr]) {
    let run: IndexedLine = [];
    for (const glyph of line) {
      if (zones.some((zone) => containsCenter(zone.rect, glyphRect(glyph)))) {
        if (run.length) lines.push(run);
        run = [];
      } else run.push(glyph);
    }
    if (run.length) lines.push(run);
  }
  return lines;
}

export function selectedGlyphRects(glyphs: IndexedGlyph[]) {
  const content = glyphs.filter(([char]) => char.trim());
  if (!content.length) return [];
  const box = coveringRect(content.map(glyphRect));
  // Adjacent PDF glyph boxes commonly share an edge. Inset horizontally so
  // floating-point conversion cannot accidentally erase a neighbor.
  const inset = Math.min(0.05, (box.x1 - box.x0) / 4);
  return [{ ...box, x0: box.x0 + inset, x1: box.x1 - inset }];
}

export async function searchIndexedPage(page: IndexedPage, query: string, options: PdfSearchOptions, zones: RedactionEdit[], signal: AbortSignal) {
  const hits: PdfSearchHit[] = [];
  for (const [kind, lines] of [page.native, page.ocr].entries()) {
    const offsets: Array<{ start: number; end: number; line: IndexedLine }> = [];
    let offset = 0;
    const items = lines.map((line) => {
      const str = line.map(([char]) => char).join("");
      offsets.push({ start: offset, end: offset + str.length, line });
      offset += str.length;
      return { str, hasEOL: true };
    });
    const matches = await searchPdfPage({ getTextContent: async () => ({ items }) }, page.page, query, signal, options);
    for (const match of matches) {
      const rects = offsets.flatMap(({ start, end, line }) => {
        if (end <= match.start || start >= match.end) return [];
        let offsetInLine = start;
        return selectedGlyphRects(line.filter(([char]) => {
          const previous = offsetInLine;
          offsetInLine += char.length;
          return previous < match.end && offsetInLine > match.start;
        }));
      });
      if (rects.length && !rects.some((rect) => zones.some((zone) => containsCenter(zone.rect, rect))) &&
        !hits.some((hit) => hit.rects?.length === rects.length &&
          rects.every((box, index) => containsCenter(hit.rects![index], box) && containsCenter(box, hit.rects![index])))) {
        hits.push({ ...match, id: `${kind}:${match.id}`, rects });
      }
    }
  }
  return hits;
}

async function fontResource(id: string) {
  const font = await getCustomFont(id);
  if (!font) throw new Error("La police du texte modifié est indisponible.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(font.binary);
  });
  return { id, fileName: font.originalFileName, sha256: font.sha256, format: font.format, dataUrl };
}

export async function loadRedactionIndex(
  url: string, file: File, onPage: (page: IndexedPage) => void, signal: AbortSignal, edits?: PdfEdit[],
) {
  const form = new FormData();
  form.set("file", file);
  if (edits) {
    const added = edits.filter((edit) => edit.type === "add_text");
    const native = edits.filter((edit) => edit.type === "native_text");
    const fonts = new Set([...added, ...native].flatMap((edit) => edit.style.fontRef?.startsWith("custom:") ? [edit.style.fontRef] : []));
    form.set("options", JSON.stringify({
      editedOnly: true, edits: added, nativeTextEdits: native,
      fontResources: await Promise.all([...fonts].map(fontResource)),
    }));
  }
  const response = await fetch(`${url}/pdf/redaction/index`, { method: "POST", body: form, signal });
  if (!response.ok) {
    const error = await response.json() as { detail?: string };
    throw new Error(typeof error.detail === "string" ? error.detail : "Indexation du texte impossible.");
  }
  if (!response.body) throw new Error("Aucun index de texte reçu.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const lines = (pending + result.value).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) onPage(JSON.parse(line) as IndexedPage);
    }
    if (pending) throw new Error("Index de texte incomplet.");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function redactionEdits(hits: Array<{ pageNumber: number; rects?: PdfRect[] }>, existing: PdfEdit[]) {
  const zones = existing.filter((edit) => edit.type === "redaction");
  const result: RedactionEdit[] = [];
  for (const hit of hits) {
    for (const rect of hit.rects ?? []) {
      if (!Object.values(rect).every(Number.isFinite) || rect.x1 <= rect.x0 || rect.y1 <= rect.y0) throw new Error("Zone de biffage invalide.");
      if ([...zones, ...result].some((edit) => edit.page === hit.pageNumber &&
        edit.rect.x0 <= rect.x0 && edit.rect.y0 <= rect.y0 && edit.rect.x1 >= rect.x1 && edit.rect.y1 >= rect.y1)) continue;
      result.push({ id: `redaction-${crypto.randomUUID()}`, type: "redaction", page: hit.pageNumber, rect });
    }
  }
  if (zones.length + result.length > 2000) throw new Error("Plus de 2 000 zones : affinez la sélection.");
  return result;
}

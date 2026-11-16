import type { PdfRect, StampEdit } from "./types";

export const WATERMARK_PRESETS = ["CONFIDENTIEL", "BROUILLON", "COPIE", "NON VALIDÉ", "POUR INFORMATION", "ARCHIVÉ"] as const;
export type WatermarkDraft = { text: string; color: string; opacity: number; rotation: number; scale: number; fontFamily: StampEdit["fontFamily"]; scope: "page" | "all" | "range"; range: string };
export const DEFAULT_WATERMARK: WatermarkDraft = { text: "CONFIDENTIEL", color: "#b91c1c", opacity: 0.25, rotation: -45, scale: 0.9, fontFamily: "Helvetica", scope: "page", range: "" };

/** Display page numbers; expanded only after syntax and document bounds checks. */
export function watermarkPages(scope: WatermarkDraft["scope"], range: string, currentPage: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 2000) throw new Error("Le filigrane accepte de 1 à 2 000 pages.");
  if (scope === "all") return Array.from({ length: count }, (_, i) => i + 1);
  if (scope === "page") { if (currentPage < 1 || currentPage > count) throw new Error("Page actuelle invalide."); return [currentPage]; }
  if (!range.trim() || range.length > 500) throw new Error("Indiquez une plage telle que 1-3, 5, 8-10.");
  const pages = new Set<number>();
  for (const part of range.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw new Error("Plage invalide : utilisez 1-3, 5, 8-10.");
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > count) throw new Error("La plage dépasse les pages du document.");
    for (let page = first; page <= last; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

export function createWatermark(page: number, rect: PdfRect, draft: WatermarkDraft, groupId: string): StampEdit {
  return { id: `watermark-${crypto.randomUUID()}`, type: "stamp", purpose: "watermark", groupId, page, rect, layoutVersion: 2,
    text: draft.text, color: draft.color, opacity: draft.opacity, rotation: draft.rotation, watermarkScale: draft.scale,
    fontFamily: draft.fontFamily, fontSize: 72, fontSizeMode: "fit", align: "center", border: false, fillOpacity: 0, paddingRatio: 0.04, offsetX: 0, offsetY: 0 };
}

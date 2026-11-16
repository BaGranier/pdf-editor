import type { PdfRect, StampEdit } from "./types";

export const STAMP_PRESETS = ["APPROUVÉ", "REFUSÉ", "BROUILLON", "CONFIDENTIEL", "COPIE", "REÇU"] as const;

export function createTextStamp(page: number, rect: PdfRect, label: string, withDate: boolean, now = new Date()): StampEdit {
  return { id: `stamp-${crypto.randomUUID()}`, type: "stamp", page, rect,
    text: `${label.trim() || "APPROUVÉ"}${withDate ? `\n${now.toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : ""}`,
    align: "center", createdAt: now.toISOString(), fontFamily: "Helvetica", fontSize: 20, color: "#b91c1c", opacity: 1, rotation: 0, border: true };
}

/** Fit rotated content inside its stable PDF rectangle, like show_pdf_page. */
export function stampRotationFit(width: number, height: number, degrees: number) {
  const angle = degrees * Math.PI / 180;
  return Math.min(width / (width * Math.abs(Math.cos(angle)) + height * Math.abs(Math.sin(angle))), height / (width * Math.abs(Math.sin(angle)) + height * Math.abs(Math.cos(angle))));
}

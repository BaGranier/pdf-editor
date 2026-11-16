import { stampFonts } from "./stampLayout";
import type { StampEdit } from "./types";

export const DEFAULT_TILE = { horizontalGapPt: 48, verticalGapPt: 64, offsetXPt: 0, offsetYPt: 0 };
export const TILE_PRESETS = {
  Discret: { horizontalGapPt: 80, verticalGapPt: 110 },
  Standard: { horizontalGapPt: 48, verticalGapPt: 64 },
  Dense: { horizontalGapPt: 24, verticalGapPt: 24 },
};
export const MAX_WATERMARK_TILES = 800;

/** Rotated pattern plane in PDF points, centred on the page. SVG and PDF clip AFTER rotation.
 * Keep the equations and limits in sync with app/watermark_tiling.py (cross-runtime golden tests).
 */
export function layoutWatermarkTiles(edit: StampEdit, width: number, height: number) {
  const tile = { ...DEFAULT_TILE, ...edit.tile };
  const size = edit.fontSize;
  if (![width, height, size, edit.rotation, ...Object.values(tile)].every(Number.isFinite) || width <= 0 || height <= 0 || size < 6 || size > 144 || tile.horizontalGapPt < 8 || tile.verticalGapPt < 8 || tile.horizontalGapPt > 720 || tile.verticalGapPt > 720 || Math.abs(tile.offsetXPt) > 720 || Math.abs(tile.offsetYPt) > 720) throw new Error("Paramètres de répétition invalides.");
  const glyphs = stampFonts[edit.fontFamily].glyphs as Record<string, number[]>;
  let top = Infinity, bottom = -Infinity;
  const measured = edit.text.split("\n").map((text, index) => {
    let advance = 0, left = Infinity, right = -Infinity;
    for (const char of text) {
      const glyph = glyphs[String(char.codePointAt(0))];
      if (!glyph || char.codePointAt(0)! > 255 || (char < " " || (char >= "\x7f" && char <= "\x9f"))) throw new Error("Filigrane : caractères Latin-1 uniquement (sans € ni Œ).");
      const [step, a, b, c, d] = glyph;
      if (char !== " ") { left = Math.min(left, advance + a); right = Math.max(right, advance + c); top = Math.min(top, index * 1.4 - d); bottom = Math.max(bottom, index * 1.4 - b); }
      advance += step;
    }
    return { text, advance, left: Number.isFinite(left) ? left : 0, right: Number.isFinite(right) ? right : 0 };
  });
  if (!edit.text.trim() || edit.text.length > 200 || !Number.isFinite(top)) throw new Error("Saisissez un texte de filigrane (200 caractères maximum).");
  const inkWidth = Math.max(...measured.map((line) => Math.max(line.advance, line.right - line.left))) * size;
  const inkHeight = (bottom - top) * size;
  const stepX = inkWidth + tile.horizontalGapPt, stepY = inkHeight + tile.verticalGapPt;
  const angle = edit.rotation * Math.PI / 180;
  const spanX = Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height;
  const spanY = Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * height;
  const firstX = Math.floor((-spanX / 2 - inkWidth / 2 - tile.offsetXPt) / stepX);
  const lastX = Math.ceil((spanX / 2 + inkWidth / 2 - tile.offsetXPt) / stepX);
  const firstY = Math.floor((-spanY / 2 - inkHeight / 2 - tile.offsetYPt) / stepY);
  const lastY = Math.ceil((spanY / 2 + inkHeight / 2 - tile.offsetYPt) / stepY);
  const count = (lastX - firstX + 1) * (lastY - firstY + 1);
  if (count > MAX_WATERMARK_TILES || count * measured.length > 2400 || count * edit.text.length > 60000) throw new Error("Motif trop dense (maximum 800 répétitions, 2 400 lignes ou 60 000 caractères par page). Augmentez les espacements ou la taille.");
  const lines: { text: string; x: number; y: number; advance: number }[] = [];
  for (let row = firstY; row <= lastY; row++) for (let col = firstX; col <= lastX; col++) {
    const cx = width / 2 + tile.offsetXPt + col * stepX;
    const cy = height / 2 + tile.offsetYPt + row * stepY;
    measured.forEach((line, index) => lines.push({ text: line.text, x: cx - (line.left + line.right) / 2 * size, y: cy - (top + bottom) / 2 * size + index * 1.4 * size, advance: line.advance * size }));
  }
  return { fontSize: size, lines, count, stepX, stepY };
}

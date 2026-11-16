import metrics from "./stampMetrics.generated.json";
import type { StampEdit } from "./types";

export const stampFonts = metrics;
export function stampPalette(edit: StampEdit) {
  const linked = edit.linkedColors ?? true;
  return { text: linked ? edit.color : edit.textColor ?? edit.color, border: linked ? edit.color : edit.borderColor ?? edit.color, fill: linked ? edit.color : edit.fillColor ?? edit.color };
}

/** Uses measured glyph ink bounds and advances, in font units, before rotation. */
export function layoutStamp(edit: StampEdit, width: number, height: number) {
  const font = metrics[edit.fontFamily];
  const lines = edit.text.split("\n");
  const measured = lines.map((line, index) => {
    let advance = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const char of line) {
      const glyph = (font.glyphs as Record<string, number[]>)[String(char.charCodeAt(0))];
      if (!glyph) return { text: line, x0: 0, x1: 1, y0: 0, y1: 1, advance: 1, invalid: true };
      const [step, a, b, c, d] = glyph;
      if (char !== " ") { x0 = Math.min(x0, advance + a); x1 = Math.max(x1, advance + c); y0 = Math.min(y0, index * 1.4 - d); y1 = Math.max(y1, index * 1.4 - b); }
      advance += step;
    }
    return { text: line, x0: Number.isFinite(x0) ? x0 : 0, x1: Number.isFinite(x1) ? x1 : 0, y0, y1, advance, invalid: false };
  });
  const inkWidth = Math.max(0.001, ...measured.map((line) => line.x1 - line.x0));
  const top = Math.min(...measured.map((line) => line.y0));
  const bottom = Math.max(...measured.map((line) => line.y1));
  const inkHeight = Math.max(0.001, bottom - top);
  const padding = Math.min(width, height) * (edit.paddingRatio ?? 0.1) + (edit.border ? (edit.borderWidth ?? 2) / 2 : 0);
  const size = edit.fontSizeMode === "fit" ? Math.min((width - 2 * padding) / inkWidth, (height - 2 * padding) / inkHeight) : edit.fontSize;
  const fontSize = Math.max(0.01, Math.min(1000, size));
  const overflow = measured.some((line) => line.invalid) || !Number.isFinite(top) || size <= 0 || inkWidth * fontSize > width - 2 * padding + 0.01 || inkHeight * fontSize > height - 2 * padding + 0.01;
  const baseline = height / 2 - (top + bottom) / 2 * fontSize;
  const align = edit.align ?? "center";
  return { fontSize, overflow, lines: measured.map((line, index) => ({ text: line.text, x: align === "left" ? padding - line.x0 * fontSize : align === "right" ? width - padding - line.x1 * fontSize : width / 2 - (line.x0 + line.x1) / 2 * fontSize, y: baseline + index * 1.4 * fontSize, advance: line.advance * fontSize })) };
}

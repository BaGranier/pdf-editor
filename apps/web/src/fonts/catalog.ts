import type { AddTextStyle } from "../editing/types";

export type FontSource = "document" | "bundled" | "custom" | "pdf-standard";
export type FontFaceStyle = "normal" | "italic";

export type FontFaceDescriptor = {
  id: string;
  family: string;
  displayName: string;
  source: FontSource;
  category: "sans-serif" | "serif" | "monospace";
  weight: number;
  style: FontFaceStyle;
  assetUrl?: string;
  fileName?: string;
  embeddable: boolean;
};

const regular = (
  slug: string,
  family: string,
  category: FontFaceDescriptor["category"],
  fileName: string,
): FontFaceDescriptor => ({
  id: `bundled:${slug}:400:normal`,
  family,
  displayName: family,
  source: "bundled",
  category,
  weight: 400,
  style: "normal",
  assetUrl: `/fonts/${fileName}`,
  fileName,
  embeddable: true,
});

export const PDF_STANDARD_FONTS: readonly FontFaceDescriptor[] = [
  { id: "pdf-standard:helvetica:400:normal", family: "Helvetica", displayName: "Helvetica", source: "pdf-standard", category: "sans-serif", weight: 400, style: "normal", embeddable: true },
  { id: "pdf-standard:helvetica:700:normal", family: "Helvetica", displayName: "Helvetica gras", source: "pdf-standard", category: "sans-serif", weight: 700, style: "normal", embeddable: true },
  { id: "pdf-standard:times:400:normal", family: "Times", displayName: "Times", source: "pdf-standard", category: "serif", weight: 400, style: "normal", embeddable: true },
  { id: "pdf-standard:courier:400:normal", family: "Courier", displayName: "Courier", source: "pdf-standard", category: "monospace", weight: 400, style: "normal", embeddable: true },
] as const;

/** Regular faces are intentionally lazy-loaded. See public/fonts/NOTICE.md. */
export const BUNDLED_FONTS: readonly FontFaceDescriptor[] = [
  regular("inter", "Inter", "sans-serif", "Inter-Regular.ttf"),
  regular("roboto", "Roboto", "sans-serif", "Roboto-Regular.ttf"),
  regular("open-sans", "Open Sans", "sans-serif", "OpenSans-Regular.ttf"),
  regular("lato", "Lato", "sans-serif", "Lato-Regular.ttf"),
  regular("source-sans-3", "Source Sans 3", "sans-serif", "SourceSans3-Regular.otf"),
  regular("noto-sans", "Noto Sans", "sans-serif", "NotoSans-Regular.ttf"),
  regular("montserrat", "Montserrat", "sans-serif", "Montserrat-Regular.ttf"),
  regular("poppins", "Poppins", "sans-serif", "Poppins-Regular.ttf"),
  regular("ibm-plex-sans", "IBM Plex Sans", "sans-serif", "IBMPlexSans-Regular.ttf"),
  regular("ubuntu", "Ubuntu", "sans-serif", "Ubuntu-Regular.ttf"),
  regular("noto-serif", "Noto Serif", "serif", "NotoSerif-Regular.ttf"),
  regular("liberation-serif", "Liberation Serif", "serif", "LiberationSerif-Regular.ttf"),
  regular("dejavu-serif", "DejaVu Serif", "serif", "DejaVuSerif.ttf"),
  regular("merriweather", "Merriweather", "serif", "Merriweather-Regular.ttf"),
  regular("playfair-display", "Playfair Display", "serif", "PlayfairDisplay-Regular.ttf"),
  regular("ibm-plex-serif", "IBM Plex Serif", "serif", "IBMPlexSerif-Regular.ttf"),
  regular("liberation-mono", "Liberation Mono", "monospace", "LiberationMono-Regular.ttf"),
  regular("dejavu-sans-mono", "DejaVu Sans Mono", "monospace", "DejaVuSansMono.ttf"),
  regular("fira-mono", "Fira Mono", "monospace", "FiraMono-Regular.ttf"),
  regular("ibm-plex-mono", "IBM Plex Mono", "monospace", "IBMPlexMono-Regular.ttf"),
] as const;

export const BUILT_IN_FONT_CATALOG = [...PDF_STANDARD_FONTS, ...BUNDLED_FONTS] as const;

const LEGACY_FONT_REFS: Record<string, string> = {
  Helvetica: "pdf-standard:helvetica:400:normal",
  Times: "pdf-standard:times:400:normal",
  Courier: "pdf-standard:courier:400:normal",
};

export function normalizeSubsetFontName(value: string) {
  return value.replace(/^[A-Z]{6}\+/, "").replace(/[-_](Regular|Roman)$/i, "");
}

export function resolveFontRef(style: Pick<AddTextStyle, "fontFamily" | "fontRef">) {
  return style.fontRef ?? LEGACY_FONT_REFS[style.fontFamily] ?? "bundled:noto-sans:400:normal";
}

export function getBuiltInFont(fontRef: string) {
  return BUILT_IN_FONT_CATALOG.find((font) => font.id === fontRef);
}

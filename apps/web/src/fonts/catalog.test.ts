import { describe, expect, it } from "vitest";
import { BUNDLED_FONTS, normalizeSubsetFontName, resolveFontRef } from "./catalog";

describe("font catalog", () => {
  it("offers twenty distinct offline families with stable references", () => {
    expect(BUNDLED_FONTS).toHaveLength(20);
    expect(new Set(BUNDLED_FONTS.map((font) => font.family))).toHaveLength(20);
    expect(BUNDLED_FONTS.every((font) => font.assetUrl?.startsWith("/fonts/") && font.embeddable)).toBe(true);
  });

  it("migrates historical PDF font names and cleans subset prefixes", () => {
    expect(resolveFontRef({ fontFamily: "Helvetica" })).toBe("pdf-standard:helvetica:400:normal");
    expect(resolveFontRef({ fontFamily: "Times" })).toBe("pdf-standard:times:400:normal");
    expect(resolveFontRef({ fontFamily: "Courier" })).toBe("pdf-standard:courier:400:normal");
    expect(normalizeSubsetFontName("ABCDEF+Inter-Regular")).toBe("Inter");
  });
});

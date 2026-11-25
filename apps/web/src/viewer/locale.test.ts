import { describe, expect, it } from "vitest";
import { englishMessages } from "./englishMessages";
import { localizePdfError, translator } from "./locale";

describe("editor localization", () => {
  it("preserves template placeholders across the English catalog", () => {
    const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
    for (const [french, english] of Object.entries(englishMessages)) {
      expect(placeholders(english), french).toEqual(placeholders(french));
    }
  });

  it("formats accessibility labels without reinterpreting document names", () => {
    const documentName = "Rapport {0}.pdf";
    expect(translator("en")("Fermer {0}", documentName)).toBe("Close Rapport {0}.pdf");
    expect(translator("fr")("Fermer {0}", documentName)).toBe("Fermer Rapport {0}.pdf");
  });

  it("translates the native error prefix while preserving the original diagnostic", () => {
    const detail = "Impossible d'écrire le PDF: os error 5";
    expect(localizePdfError("en", detail)).toBe("Could not write the PDF: os error 5");
    expect(localizePdfError("fr", detail)).toBe(detail);
  });
});

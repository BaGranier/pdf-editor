import { describe, expect, it } from "vitest";
import {
  getSuggestedPdfSaveName,
  normalizePdfFileName,
} from "./fileName";

describe("normalizePdfFileName", () => {
  it.each([
    ["contrat-final", "contrat-final.pdf"],
    ["contrat-final.pdf", "contrat-final.pdf"],
    ["contrat-final.PDF", "contrat-final.pdf"],
    ["contrat-final.pdf.pdf", "contrat-final.pdf"],
    [" été 2026 (signé) ", "été 2026 (signé).pdf"],
    ["rapport.v2.final", "rapport.v2.final.pdf"],
    ["rapport: client?.pdf", "rapport- client-.pdf"],
    ["CON.pdf", "_CON.pdf"],
  ])("normalise %s en %s", (value, expected) => {
    expect(normalizePdfFileName(value)).toEqual({
      fileName: expected,
      error: null,
    });
  });

  it.each(["", "   ", ".pdf", " .PDF ", "..."])(
    "refuse le nom vide %j",
    (value) => {
      expect(normalizePdfFileName(value)).toEqual({
        fileName: null,
        error: "Saisissez un nom de fichier avant d'enregistrer.",
      });
    },
  );
});

describe("getSuggestedPdfSaveName", () => {
  it("propose un nom modifié stable", () => {
    expect(getSuggestedPdfSaveName("contrat.pdf")).toBe(
      "contrat-modifie.pdf",
    );
    expect(getSuggestedPdfSaveName("contrat-modifie.pdf")).toBe(
      "contrat-modifie.pdf",
    );
  });

  it("préfère le nom de travail défini par Enregistrer sous", () => {
    expect(
      getSuggestedPdfSaveName("contrat-final-2.pdf", "contrat-final.pdf"),
    ).toBe("contrat-final.pdf");
  });
});

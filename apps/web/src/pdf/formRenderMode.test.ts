import { describe, expect, it } from "vitest";
import { getDisplayAnnotationMode } from "./formRenderMode";

describe("AcroForm display annotation mode", () => {
  const modes = { ENABLE: 1, ENABLE_FORMS: 2 };

  it("excludes interactive widget appearances only while PdfFormLayer owns the page", () => {
    expect(getDisplayAnnotationMode(true, modes)).toBe(modes.ENABLE_FORMS);
    expect(getDisplayAnnotationMode(false, modes)).toBe(modes.ENABLE);
  });
});

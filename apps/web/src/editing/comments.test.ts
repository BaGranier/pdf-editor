import { describe, expect, it } from "vitest";
import { getCommentTypeLabel } from "./comments";

describe("getCommentTypeLabel", () => {
  it("uses readable labels for native PDF annotation types", () => {
    expect(getCommentTypeLabel("text")).toBe("Commentaire");
    expect(getCommentTypeLabel("free_text")).toBe("Texte libre");
    expect(getCommentTypeLabel("highlight")).toBe("Surlignage");
    expect(getCommentTypeLabel("underline")).toBe("Soulignage");
    expect(getCommentTypeLabel("strikeout")).toBe("Barré");
  });
});

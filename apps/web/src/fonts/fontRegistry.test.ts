import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureFontLoaded, getCustomFont, importCustomFont, removeCustomFont, setProtectedFontRefs } from "./fontRegistry";

describe("custom font registry", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new ArrayBuffer(32)) } });
  });

  afterEach(() => {
    setProtectedFontRefs([]);
    vi.unstubAllGlobals();
  });

  it("hashes, persists in the local fallback and deduplicates a TTF", async () => {
    const file = new File([new Uint8Array([0, 1, 0, 0, 1, 2, 3, 4])], "MaPolice-Regular.ttf", { type: "font/ttf" });
    const first = await importCustomFont(file);
    const second = await importCustomFont(file);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(first.font.id).toBe(`custom:${"0".repeat(64)}`);
    expect((await getCustomFont(first.font.id))?.originalFileName).toBe(file.name);
    await removeCustomFont(first.font.id);
    expect(await getCustomFont(first.font.id)).toBeNull();
  });

  it("rejects an empty or disguised font file", async () => {
    await expect(importCustomFont(new File([], "empty.ttf"))).rejects.toThrow("vide");
    await expect(importCustomFont(new File(["not-a-font"], "fake.otf"))).rejects.toThrow("valide");
  });

  it("refuses to remove a font referenced by an open document", async () => {
    const file = new File([new Uint8Array([0, 1, 0, 0, 1, 2, 3, 4])], "DocumentFont.ttf", { type: "font/ttf" });
    const { font } = await importCustomFont(file);
    setProtectedFontRefs([font.id]);
    await expect(removeCustomFont(font.id)).rejects.toThrow("encore utilisée");
    expect(await getCustomFont(font.id)).not.toBeNull();
  });

  it("loads a bundled FontFace lazily and deduplicates concurrent requests", async () => {
    const load = vi.fn(async () => undefined);
    const add = vi.fn();
    const FontFaceMock = vi.fn(function () { return { load }; });
    const previousFonts = Object.getOwnPropertyDescriptor(document, "fonts");
    Object.defineProperty(document, "fonts", { configurable: true, value: { add } });
    vi.stubGlobal("FontFace", FontFaceMock);
    try {
      await Promise.all([
        ensureFontLoaded("bundled:inter:400:normal"),
        ensureFontLoaded("bundled:inter:400:normal"),
      ]);
      expect(FontFaceMock).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledTimes(1);
    } finally {
      if (previousFonts) Object.defineProperty(document, "fonts", previousFonts);
      else Reflect.deleteProperty(document, "fonts");
    }
  });
});

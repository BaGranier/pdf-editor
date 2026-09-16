import { afterEach, describe, expect, it, vi } from "vitest";
import { clearNativeTextCache, renderNativeTextBackground } from "./nativeText";
import type { NativeTextEdit } from "../editing/types";

const edit: NativeTextEdit = {
  id: "native-1",
  type: "native_text",
  page: 1,
  rect: { x0: 10, y0: 10, x1: 120, y1: 30 },
  source: {
    sourceId: "source-1", sourceText: "Massy TGV", sourceBBox: { x0: 10, y0: 10, x1: 120, y1: 30 }, sourceOrigin: { x: 10, y: 20 }, sourceFontSize: 12, sourceColor: "#000000", sourceRotation: 0, sourceFingerprint: "f".repeat(64), editable: true,
  },
  text: "Massy TGV modifié",
  style: { fontFamily: "Helvetica", fontRef: "pdf-standard:helvetica:400:normal", fontSize: 12, color: "#000000", bold: false },
};

describe("native text background preview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("caches a source-only clean patch instead of posting every draft character", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, blob: async () => new Blob(["png"]) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["pdf"], "source.pdf", { type: "application/pdf" });
    await renderNativeTextBackground("http://engine", file, 1, [edit]);
    await renderNativeTextBackground("http://engine", file, 1, [{ ...edit, text: "Massy TGV encore modifié" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as FormData;
    const plan = JSON.parse(String(body.get("plan"))) as { edits: NativeTextEdit[] };
    expect(plan.edits[0].text).toBe("");
    clearNativeTextCache(file);
  });
});

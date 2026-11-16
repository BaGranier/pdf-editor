import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareSearchRedactions } from "./redactionSearch";
import { pdfEditsReducer } from "./state";
import type { PdfSearchHit } from "../pdf/search";

const hit: PdfSearchHit = { id: "hit", pageNumber: 1, start: 0, end: 6, context: "SECRET", proof: { digest: "0".repeat(64), start: 0, end: 6, text: "SECRET" } };
const rect = { x0: 10, y0: 20, x1: 80, y1: 40 };
afterEach(() => vi.unstubAllGlobals());
describe("validated search redactions", () => {
  it("deduplicates prepared zones and commits a whole batch with one undo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ matches: [{ id: "hit", page: 1, rects: [rect, rect] }] }) })));
    const edits = await prepareSearchRedactions(new File(["synthetic"], "test.pdf"), "http://local", [hit], []);
    expect(edits).toHaveLength(1);
    let state = pdfEditsReducer({}, { type: "batch", documentId: "doc", add: edits });
    expect(state.doc.isDirty).toBe(true);
    expect(await prepareSearchRedactions(new File([], "test.pdf"), "http://local", [hit], edits)).toEqual([]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(state.doc.edits).toEqual([]);
    expect(state.doc.isDirty).toBe(false);
  });
  it("refuses incomplete or unverifiable geometry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ matches: [] }) })));
    await expect(prepareSearchRedactions(new File([], "test.pdf"), "http://local", [hit], [])).rejects.toThrow("incomplète");
    await expect(prepareSearchRedactions(new File([], "test.pdf"), "http://local", [{ ...hit, proof: undefined }], [])).rejects.toThrow("preuve");
  });
});

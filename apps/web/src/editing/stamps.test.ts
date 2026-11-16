import { describe, expect, it } from "vitest";
import { createTextStamp, STAMP_PRESETS, stampRotationFit } from "./stamps";
import { pdfEditsReducer } from "./state";
import { toStoredPdfDocument } from "../storage/viewerStorage";

const rect = { x0: 10, y0: 10, x1: 230, y1: 100 };
describe("stamps", () => {
  it("freezes dates at insertion and roundtrips through the existing persisted model", () => {
    const edit = createTextStamp(1, rect, "REÇU", true, new Date("2026-11-16T12:00:00Z"));
    expect(edit.text).toBe("REÇU\n16/11/2026");
    const record = toStoredPdfDocument({ id: "doc", fileName: "synthetic.pdf", content: new Blob(), mimeType: "application/pdf", pageCount: 1, zoom: 1, scrollLeft: 0, scrollTop: 0, edits: [edit] });
    expect(JSON.parse(JSON.stringify(record.edits))).toEqual([edit]);
    expect(STAMP_PRESETS).toContain("APPROUVÉ");
  });
  it("coalesces continuous rotation, undo/redo and tracks dirty state", () => {
    const edit = createTextStamp(1, rect, "PRIVÉ", false);
    let state = pdfEditsReducer({}, { type: "add", documentId: "doc", edit });
    for (const rotation of [10, 20, 30]) state = pdfEditsReducer(state, { type: "replace", documentId: "doc", edit: { ...edit, rotation }, coalesceKey: "rotation" });
    expect(state.doc.past).toHaveLength(2);
    expect(state.doc.isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(state.doc.edits).toEqual([edit]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc" });
    expect(state.doc.edits[0]).toMatchObject({ rotation: 30 });
  });
  it("fits rotated content without stretching", () => {
    expect(stampRotationFit(220, 90, 0)).toBeCloseTo(1);
    expect(stampRotationFit(220, 90, 90)).toBeCloseTo(90 / 220);
    expect(stampRotationFit(220, 90, -30)).toBeCloseTo(stampRotationFit(220, 90, 30));
  });
});

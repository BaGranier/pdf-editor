import { describe, expect, it } from "vitest";
import cases from "./watermarkTiling.cases.json";
import { DEFAULT_TILE, layoutWatermarkTiles } from "./watermarkTiling";
import { createWatermark, DEFAULT_WATERMARK } from "./watermarks";
import { pdfEditsReducer } from "./state";

const rect = { x0: 0, y0: 0, x1: 595, y1: 842 };
const make = () => createWatermark(1, rect, { ...DEFAULT_WATERMARK, text: "Test", mode: "tiled" }, "g");
describe("tiled watermarks in native PDF points", () => {
  it("leaves historical single objects and payloads unchanged", () => {
    const edit = createWatermark(1, rect, DEFAULT_WATERMARK, "g");
    expect(edit.watermarkMode).toBeUndefined(); expect(edit.tile).toBeUndefined();
    expect(edit.fontSizeMode).toBe("fit");
  });
  it.each(cases)("matches export geometry for $width × $height, angle $rotation", (sample) => {
    const edit = { ...make(), text: sample.text, rotation: sample.rotation, tile: { ...DEFAULT_TILE, offsetXPt: sample.offsetXPt, offsetYPt: sample.offsetYPt } };
    const layout = layoutWatermarkTiles(edit, sample.width, sample.height);
    expect(layout.count).toBe(sample.count);
    for (const [line, expected] of [[layout.lines[0], sample.first], [layout.lines[layout.lines.length - 1], sample.last]] as const) {
      expect(line.text).toBe(expected[0]);
      expect(line.x).toBeCloseTo(Number(expected[1]), 3); expect(line.y).toBeCloseTo(Number(expected[2]), 3);
    }
    expect(layout.count).toBeGreaterThan(1);
    const angle = sample.rotation * Math.PI / 180;
    const spanX = Math.abs(Math.cos(angle)) * sample.width + Math.abs(Math.sin(angle)) * sample.height;
    expect(layout.lines[0].x).toBeLessThan(sample.width / 2 - spanX / 2);
    expect(layout.lines[layout.lines.length - 1].x).toBeGreaterThan(sample.width / 2);
  });
  it("uses font metrics and adjustable gaps without screen or DPR coordinates", () => {
    const edit = make(); const first = layoutWatermarkTiles(edit, 595, 842);
    const sparse = layoutWatermarkTiles({ ...edit, tile: { ...DEFAULT_TILE, horizontalGapPt: 150, verticalGapPt: 150 } }, 595, 842);
    expect(sparse.count).toBeLessThan(first.count);
    expect(sparse.stepX - first.stepX).toBeCloseTo(102);
    for (const opacity of [0, 1]) expect(layoutWatermarkTiles({ ...edit, opacity }, 595, 842)).toEqual(first);
    expect(layoutWatermarkTiles({ ...edit, fontFamily: "Courier" }, 595, 842).stepX).not.toBe(first.stepX);
  });
  it("rejects unsupported text and excessive density before allocating occurrences", () => {
    for (const text of ["", "  ", "中文", "€", "🙂", "X".repeat(201)]) expect(() => layoutWatermarkTiles({ ...make(), text }, 595, 842)).toThrow();
    expect(() => layoutWatermarkTiles({ ...make(), text: "I", fontSize: 6, tile: { ...DEFAULT_TILE, horizontalGapPt: 8, verticalGapPt: 8 } }, 595, 842)).toThrow(/800/);
    expect(() => layoutWatermarkTiles({ ...make(), tile: { ...DEFAULT_TILE, horizontalGapPt: 0 } }, 595, 842)).toThrow();
  });
  it("persists parameters, keeps one object and coalesces a slider gesture", () => {
    const edit = make();
    let state = pdfEditsReducer({}, { type: "batch", documentId: "doc", add: [edit] });
    for (const offsetXPt of [10, 20, 30]) state = pdfEditsReducer(state, { type: "batch", documentId: "doc", replace: [{ ...edit, tile: { ...DEFAULT_TILE, offsetXPt } }], coalesceKey: "phase" });
    expect(state.doc.edits).toHaveLength(1); expect(state.doc.past).toHaveLength(2);
    const stored = JSON.parse(JSON.stringify(state));
    expect(stored.doc.edits[0].tile.offsetXPt).toBe(30);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(state.doc.edits[0]).toEqual(edit);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc" });
    expect(state.doc.edits[0]).toEqual(stored.doc.edits[0]);
  });
});

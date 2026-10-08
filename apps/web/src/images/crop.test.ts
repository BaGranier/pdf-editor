import { describe, expect, it } from "vitest";
import { FULL_IMAGE_CROP, croppedImageRect, validImageCrop } from "./crop";
import { pdfEditsReducer, getDocumentEditingState } from "../editing/state";
import type { ImageEdit, PdfEdit } from "../editing/types";

describe("non destructive image crop", () => {
  const image: ImageEdit = { id: "image", type: "image", imageId: "asset", page: 1, rect: { x0: 10, y0: 20, x1: 210, y1: 120 } };
  const crop = { x: .25, y: .2, width: .5, height: .6 };
  it("preserves source scale and restores the complete image after free resize", () => {
    const rect = croppedImageRect(image.rect, FULL_IMAGE_CROP, crop);
    expect(rect).toEqual({ x0: 60, y0: 40, x1: 160, y1: 100 });
    expect(croppedImageRect(rect, crop, FULL_IMAGE_CROP)).toEqual(image.rect);
    expect(validImageCrop(crop)).toBe(true);
    expect(validImageCrop({ ...crop, width: 1 })).toBe(false);
  });
  it("commits crop/reset and ratio toggle to undo/redo without copying the asset", () => {
    const initial = pdfEditsReducer({}, { type: "hydrate", documentId: "doc", edits: [image] });
    let state = pdfEditsReducer(initial, { type: "replace", documentId: "doc", edit: { ...image, crop } });
    expect(getDocumentEditingState(state, "doc").isDirty).toBe(true);
    state = pdfEditsReducer(state, { type: "undo", documentId: "doc" });
    expect(getDocumentEditingState(state, "doc").edits).toEqual([image]);
    state = pdfEditsReducer(state, { type: "redo", documentId: "doc" });
    expect((getDocumentEditingState(state, "doc").edits[0] as ImageEdit).crop).toEqual(crop);
    state = pdfEditsReducer(state, { type: "replace", documentId: "doc", edit: { ...image, aspectLocked: false } });
    expect((getDocumentEditingState(state, "doc").edits[0] as ImageEdit).crop).toBeUndefined();
    expect(getDocumentEditingState(state, "doc").past).toHaveLength(2);
  });
  it.each(["front", "back", "forward", "backward"] as const)("includes highlights in %s ordering", (direction) => {
    const highlight: PdfEdit = { id: "highlight", type: "text_markup", page: 1, rect: image.rect, rects: [image.rect], color: "#ffff00", kind: "highlight" };
    const edits = [image, highlight];
    const state = pdfEditsReducer({}, { type: "hydrate", documentId: "doc", edits });
    const reordered = pdfEditsReducer(state, { type: "reorder", documentId: "doc", editId: direction === "front" || direction === "forward" ? "image" : "highlight", direction });
    expect(getDocumentEditingState(reordered, "doc").edits.map(e => e.id)).toEqual(["highlight", "image"]);
  });
});

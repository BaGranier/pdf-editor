import * as pdfjs from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { inspectImage, readImageSource, createImagePdf, validateImageDocumentSession } from "./imageDocument";
import { MAX_IMAGE_BYTES } from "./imagePolicy";
import { pdfEditsReducer, getDocumentEditingState } from "../editing/state";
import type { ImageBackgroundEdit } from "../editing/types";
import { buildViewerSnapshot, restoreOpenDocument, getUniqueFileName } from "../pdf/documentLifecycle";
import type { OpenPdfDocument } from "../pdf/documentLifecycle";

vi.mock("pdfjs-dist", () => ({ getDocument: vi.fn() }));

function fixture(name: string) {
  const bytes = readFileSync(`e2e/fixtures/${name}`);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
function webp(kind: string, size = 30) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0); view.setUint32(4, size - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8); bytes.set(new TextEncoder().encode(kind), 12);
  view.setUint32(16, size - 20, true);
  return bytes;
}

describe("image document boundaries", () => {
  it("detects by bytes and applies JPEG EXIF orientation once", async () => {
    expect(inspectImage(fixture("editor-image.png"))).toEqual({ mimeType: "image/png", widthPx: 160, heightPx: 80 });
    expect(inspectImage(fixture("editor-image.jpg"))).toEqual({ mimeType: "image/jpeg", widthPx: 160, heightPx: 80 });
    expect(inspectImage(fixture("editor-image-oriented.jpg"))).toEqual({ mimeType: "image/jpeg", widthPx: 80, heightPx: 160 });
    const disguised = new File([fixture("editor-image.jpg")], "fake.png", { type: "text/plain" });
    expect((await readImageSource(disguised)).mimeType).toBe("image/jpeg");
  });
  it("reads all three static WebP header variants and rejects animation and extreme dimensions", () => {
    const lossy = webp("VP8 "); lossy.set([157, 1, 42], 23); lossy[26] = 20; lossy[28] = 10;
    expect(inspectImage(lossy.buffer)).toMatchObject({ widthPx: 20, heightPx: 10, mimeType: "image/webp" });
    const lossless = webp("VP8L"); lossless[20] = 47;
    expect(inspectImage(lossless.buffer)).toMatchObject({ widthPx: 1, heightPx: 1 });
    const extended = webp("VP8X"); extended[24] = 39; extended[27] = 19;
    expect(inspectImage(extended.buffer)).toMatchObject({ widthPx: 40, heightPx: 20 });
    extended[20] = 2;
    expect(() => inspectImage(extended.buffer)).toThrow(/animées/);
    extended[20] = 0; extended.fill(255, 24);
    expect(() => inspectImage(extended.buffer)).toThrow(/dimensions/);
  });
  it("rejects unsupported, truncated, empty and oversized inputs before conversion", async () => {
    for (const data of [new ArrayBuffer(0), new TextEncoder().encode("GIF89a").buffer, fixture("editor-image.png").slice(0, 23)]) expect(() => inspectImage(data)).toThrow();
    await expect(readImageSource(new Blob([]))).rejects.toThrow(/vide/);
    const large = { size: MAX_IMAGE_BYTES + 1, arrayBuffer: vi.fn() };
    await expect(readImageSource(large as unknown as Blob)).rejects.toThrow(/32 Mio/);
    expect(large.arrayBuffer).not.toHaveBeenCalled();
    const extreme = fixture("editor-image.png"); const view = new DataView(extreme); view.setUint32(16, 20001);
    expect(() => inspectImage(extreme)).toThrow();
  });
  it("keeps only the original blob in persisted image documents", () => {
    const original = new Blob([fixture("editor-image.png")]);
    const snapshot = buildViewerSnapshot({ id: "image", fileName: "source.png", file: new File(["%PDF-proxy"], "source.pdf"), media: { kind: "image", original, mimeType: "image/png", widthPx: 160, heightPx: 80 } } as OpenPdfDocument);
    expect(snapshot.content).toBe(original);
    expect(snapshot.media).toEqual({ kind: "image", mimeType: "image/png", widthPx: 160, heightPx: 80 });
    expect(snapshot.media).not.toHaveProperty("original");
    expect(getUniqueFileName("photo.jpg", ["photo.jpg"])).toBe("photo-2.jpg");
  });
  it("shares undo, redo, dirty state and reset without modifying the source", () => {
    const edit: ImageBackgroundEdit = { id: "background", type: "image_background", page: 1, rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, transforms: [{ type: "mirror_horizontal" }, { type: "crop", x: 0, y: 0, width: 0.5, height: 1 }] };
    let state = pdfEditsReducer({}, { type: "add", documentId: "image", edit });
    expect(getDocumentEditingState(state, "image").isDirty).toBe(true);
    expect(getDocumentEditingState(state, "other").edits).toEqual([]);
    state = pdfEditsReducer(state, { type: "undo", documentId: "image" });
    expect(getDocumentEditingState(state, "image").isDirty).toBe(false);
    state = pdfEditsReducer(state, { type: "redo", documentId: "image" });
    expect(getDocumentEditingState(state, "image").edits).toEqual([edit]);
    state = pdfEditsReducer(state, { type: "delete", documentId: "image", editId: edit.id });
    expect(getDocumentEditingState(state, "image").edits).toEqual([]);
  });
  it("sends source bytes and layout, and surfaces backend failures", async () => {
    const source = await readImageSource(new File([fixture("editor-image.jpg")], "test.jpg"));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("%PDF-"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await createImagePdf("http://localhost", [source])).size).toBe(5);
      expect(fetchMock.mock.calls[0][0]).toBe("http://localhost/images/pdf");
      const form = fetchMock.mock.calls[0][1].body as FormData;
      expect((form.get("files") as Blob).size).toBe(source.original.size);
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "Image corrompue" }), { status: 422 }));
      await expect(createImagePdf("http://localhost", [source])).rejects.toThrow("Image corrompue");
    } finally { vi.unstubAllGlobals(); }
  });
});


it("revalidates and materializes restored originals, replays transforms and never stores the proxy", async () => {
  const source = await readImageSource(new Blob([fixture("editor-image.png")]));
  const destroy = vi.fn().mockResolvedValue(undefined);
  vi.mocked(pdfjs.getDocument).mockReturnValue({ promise: Promise.resolve({ numPages: 1 }), destroy } as never);
  const fetchMock = vi.fn().mockResolvedValue(new Response("%PDF-restored", { headers: { "content-type": "application/pdf" } }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    const restored = await restoreOpenDocument({ id: "restored-image", fileName: "source.png", mimeType: "application/pdf", content: source.original, media: { kind: "image", mimeType: "image/png", widthPx: 160, heightPx: 80 }, pageCount: 1, zoom: 1.5, scrollLeft: 0, scrollTop: 20, updatedAt: 0, edits: [{ id: "background", type: "image_background", page: 1, rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, transforms: [{ type: "mirror_vertical" }] }] }, "http://local");
    expect(await restored.file.text()).toBe("%PDF-restored");
    expect(restored.imageBackgroundKey).toBe('[{"type":"mirror_vertical"}]');
    expect(restored.zoom).toBe(1.5);
    const snapshot = buildViewerSnapshot(restored);
    expect(await snapshot.content.arrayBuffer()).toEqual(await source.original.arrayBuffer());
    expect(snapshot.content.size).toBe(source.original.size);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1].body as FormData).get("options"))).transforms).toEqual([{ type: "mirror_vertical" }]);
  } finally { vi.unstubAllGlobals(); }
});

it("bounds aggregate image memory and honors cancellation before upload", async () => {
  const source = await readImageSource(new Blob([fixture("editor-image.png")]));
  expect(() => validateImageDocumentSession([{ ...source, widthPx: 20000, heightPx: 10000 }])).toThrow(/Budget/);
  const controller = new AbortController(); controller.abort();
  await expect(createImagePdf("http://local", [source], undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjs from "pdfjs-dist";
import * as native from "./desktop/files";
import { App } from "./App";
import { clearViewerStorage } from "./storage/viewerStorage";

const runtime = vi.hoisted(() => ({ desktop: false }));
vi.mock("./api/backend", async (original) => ({ ...await original<object>(), isDesktopRuntime: () => runtime.desktop }));
vi.mock("./desktop/files", () => ({ openDesktopPdf: vi.fn(), getDesktopStartupPdfs: vi.fn().mockResolvedValue([]), saveDesktopPdf: vi.fn(), saveDesktopPdfAs: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, AnnotationMode: { ENABLE: 1, ENABLE_FORMS: 2 }, getDocument: vi.fn(), TextLayer: class { textContentItemsStr: string[] = []; render = vi.fn().mockResolvedValue(undefined); cancel = vi.fn(); } }));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({ default: "mock-worker" }));
function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mockDocument() {
  const gates = new Map<number, ReturnType<typeof deferred>>();
  const cancelled: number[] = [];
  const proxy = {
    numPages: 3, cleanup: vi.fn().mockResolvedValue(undefined),
    getPage: vi.fn(async (pageNumber: number) => ({
      view: [0, 0, 600, 800],
      getViewport: ({ scale = 1 }) => ({ width: 600 * scale, height: 800 * scale, scale, rotation: 0, userUnit: 1, viewBox: [0, 0, 600, 800], transform: [scale, 0, 0, -scale, 0, 800 * scale], convertToPdfPoint: (x: number, y: number) => [x / scale, 800 - y / scale], convertToViewportPoint: (x: number, y: number) => [x * scale, (800 - y) * scale] }),
      streamTextContent: () => new ReadableStream(),
      render: () => ({ promise: gates.get(pageNumber)?.promise ?? Promise.resolve(), cancel: () => cancelled.push(pageNumber) }),
    })),
  };
  vi.mocked(pdfjs.getDocument).mockReturnValue({ promise: Promise.resolve(proxy), destroy: vi.fn().mockResolvedValue(undefined) } as never);
  return { gates, cancelled };
}
async function open() {
  render(<App />);
  if (runtime.desktop) fireEvent.click(screen.getByRole("button", { name: "Ouvrir un PDF" }));
  else fireEvent.change(within(screen.getByRole("complementary", { name: "Documents ouverts" })).getByLabelText("Ouvrir un PDF"), { target: { files: [new File(["%PDF-original"], "source.pdf", { type: "application/pdf" })] } });
  await screen.findByLabelText("Couche d'édition de la page 1");
}
function addText(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter du texte" }));
  fireEvent.click(screen.getByLabelText("Couche d'édition de la page 1"), { clientX: 50, clientY: 70 });
  fireEvent.change(screen.getByLabelText("Texte ajouté page 1"), { target: { value: text } });
  fireEvent.blur(screen.getByLabelText("Texte ajouté page 1"));
}
const dirty = () => document.querySelector('.document-select[aria-describedby^="document-dirty-"]');
beforeEach(async () => {
  localStorage.clear(); await clearViewerStorage(); vi.clearAllMocks(); runtime.desktop = false;
  vi.mocked(native.openDesktopPdf).mockResolvedValue({ documentId: "original-source", file: new File(["%PDF-original"], "source.pdf", { type: "application/pdf" }) });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/pdf/export/organize") ? new Response("%PDF-exported", { headers: { "content-type": "application/pdf" } }) : new Response(JSON.stringify({ fields: [], annotations: [], spans: [] }), { headers: { "content-type": "application/json" } })));
  mockDocument();
});
afterEach(() => { vi.unstubAllGlobals(); });
describe("first save destination (simulated native IPC, not Windows validation)", () => {
  it("uses Save As initially, keeps cancellation/error dirty then saves to the chosen destination", async () => {
    runtime.desktop = true;
    vi.mocked(native.saveDesktopPdfAs).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("writing failed")).mockResolvedValue({ documentId: "chosen-copy", fileName: "copy.pdf" });
    vi.mocked(native.saveDesktopPdf).mockResolvedValue({ documentId: "chosen-copy", fileName: "copy.pdf" });
    await open(); addText("First edit");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await screen.findByText("Enregistrement annulé.");
    expect(dirty()).not.toBeNull(); expect(native.saveDesktopPdf).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await screen.findByText(/writing failed/);
    expect(dirty()).not.toBeNull(); expect(native.saveDesktopPdf).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(dirty()).toBeNull());
    expect(native.saveDesktopPdfAs).toHaveBeenCalledTimes(3);
    fireEvent.change(screen.getByLabelText("Texte ajouté page 1"), { target: { value: "Second edit" } });
    fireEvent.blur(screen.getByLabelText("Texte ajouté page 1"));
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(native.saveDesktopPdf).toHaveBeenCalledWith("chosen-copy", expect.objectContaining({ size: 13, type: "application/pdf" })));
    await waitFor(() => expect(dirty()).toBeNull());
    expect(native.saveDesktopPdfAs).toHaveBeenCalledTimes(3);
    fireEvent.keyDown(window, { key: "s", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(native.saveDesktopPdfAs).toHaveBeenCalledTimes(4));
    expect(vi.mocked(native.saveDesktopPdf).mock.calls.some(([id]) => id === "original-source")).toBe(false);
  });
});
describe("presentation complete frames", () => {
  it("keeps the current canvas, ignores obsolete renders and preserves the frame on error", async () => {
    const { gates, cancelled } = mockDocument(); await open();
    fireEvent.click(screen.getByRole("button", { name: "Aller à la page 1" }));
    fireEvent.change(screen.getByLabelText("Mode d'affichage"), { target: { value: "presentation" } });
    await waitFor(() => expect(document.querySelector('.pdf-page[data-page-number="1"]')).toHaveAttribute("data-render-state", "ready"));
    const front = document.querySelector('.pdf-page[data-page-number="1"] canvas') as HTMLCanvasElement;
    const width = front.width, height = front.height;
    const second = deferred(), third = deferred(); gates.set(2, second); gates.set(3, third);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(document.querySelector('[data-page-number="2"]')).toHaveAttribute("data-render-state", "loading"));
    expect(front.isConnected).toBe(true); expect(front.width).toBe(width); expect(front.height).toBe(height);
    expect(document.querySelector('[data-page-number="1"]')).toHaveAttribute("data-page-buffer", "front");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(document.querySelector('[data-page-number="3"]')).toHaveAttribute("data-render-state", "loading"));
    expect(cancelled).toContain(2);
    await act(async () => { second.resolve(); });
    expect(document.querySelector('[data-page-number="1"]')).toHaveAttribute("data-page-buffer", "front");
    await act(async () => { third.resolve(); });
    await waitFor(() => expect(document.querySelector('[data-page-number="3"]')).toHaveAttribute("data-page-buffer", "front"));
    expect(document.querySelectorAll(".viewer .pdf-page")).toHaveLength(1);
    const failed = deferred(); gates.set(2, failed);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(document.querySelector('[data-page-number="2"]')).toHaveAttribute("data-render-state", "loading"));
    await act(async () => { failed.reject(new Error("synthetic render failure")); });
    expect(document.querySelector('[data-page-number="3"]')).toHaveAttribute("data-page-buffer", "front");
    expect(screen.getByText(/slide courante est conservée/)).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("main")).not.toHaveClass("app-shell--presentation");
  });
});

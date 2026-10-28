import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDesktopStartupPdfs,
  openDesktopPdf,
  saveDesktopPdf,
  saveDesktopPdfAs,
  MVP_DESKTOP_SAVE_MAX_BYTES,
} from "./files";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("desktop file bridge", () => {
  afterEach(() => invokeMock.mockReset());

  it("opens the PDF chosen by the bounded native command", async () => {
    invokeMock.mockResolvedValue({
      documentId: "desktop-pdf-1",
      fileName: "source.PDF",
      bytes: [37, 80, 68, 70],
    });

    await expect(openDesktopPdf()).resolves.toMatchObject({
      documentId: "desktop-pdf-1",
      file: expect.objectContaining({ name: "source.PDF", type: "application/pdf" }),
    });
    expect(invokeMock).toHaveBeenCalledWith("open_pdf");
  });

  it("keeps cancellation distinct from a failed open", async () => {
    invokeMock.mockResolvedValue(null);
    await expect(openDesktopPdf()).resolves.toBeNull();
  });

  it("sends a current desktop destination directly to Rust", async () => {
    invokeMock.mockResolvedValue({ documentId: "desktop-pdf-1", fileName: "source.pdf" });
    await saveDesktopPdf("desktop-pdf-1", new Blob(["%PDF"]));

    expect(invokeMock).toHaveBeenCalledWith("save_pdf", expect.any(Uint8Array), {
      headers: { "x-document-id": "desktop-pdf-1" },
    });
  });

  it("uses Save As for a new destination and preserves cancellation", async () => {
    invokeMock.mockResolvedValue(null);
    await expect(saveDesktopPdfAs("copy.pdf", new Blob(["%PDF"]))).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("save_pdf_as", expect.any(Uint8Array), {
      headers: { "x-pdf-name": "copy.pdf" },
    });
  });

  it.each(["save", "save_as"])("preserves native string error details for %s", async (operation) => {
    invokeMock.mockRejectedValue("Le répertoire de destination n’est pas disponible.");
    const save = operation === "save"
      ? saveDesktopPdf("desktop-pdf-1", new Blob(["%PDF"]))
      : saveDesktopPdfAs("copy.pdf", new Blob(["%PDF"]));
    await expect(save).rejects.toThrow("Le répertoire de destination n’est pas disponible.");
  });

  it("materializes every PDF supplied at application startup", async () => {
    invokeMock.mockResolvedValue([{ documentId: "desktop-pdf-2", fileName: "launch.pdf", bytes: [37] }]);
    const files = await getDesktopStartupPdfs();

    expect(files).toHaveLength(1);
    expect(files[0].file.name).toBe("launch.pdf");
    expect(invokeMock).toHaveBeenCalledWith("get_startup_pdfs");
  });

  it("rejects an oversized Preview save before reading or invoking native IPC", async () => {
    const content = new Blob([new Uint8Array(MVP_DESKTOP_SAVE_MAX_BYTES + 1)]);
    const read = vi.spyOn(content, "arrayBuffer");
    await expect(saveDesktopPdfAs("large.pdf", content)).rejects.toThrow("25 Mio");
    await expect(saveDesktopPdf("desktop-1", content)).rejects.toThrow("25 Mio");
    expect(read).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("transports Unicode names as metadata while keeping PDF bytes binary", async () => {
    invokeMock.mockResolvedValue(null);
    await saveDesktopPdfAs("été.pdf", new Blob(["%PDF-1.7"]));
    expect(invokeMock).toHaveBeenCalledWith("save_pdf_as", expect.any(Uint8Array), {
      headers: { "x-pdf-name": "%C3%A9t%C3%A9.pdf" },
    });
  });
});

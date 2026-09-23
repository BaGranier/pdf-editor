import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDesktopStartupPdfs,
  openDesktopPdf,
  saveDesktopPdf,
  saveDesktopPdfAs,
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

    expect(invokeMock).toHaveBeenCalledWith("save_pdf", expect.objectContaining({
      documentId: "desktop-pdf-1",
      content: expect.any(Uint8Array),
    }));
  });

  it("uses Save As for a new destination and preserves cancellation", async () => {
    invokeMock.mockResolvedValue(null);
    await expect(saveDesktopPdfAs("copy.pdf", new Blob(["%PDF"]))).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("save_pdf_as", expect.objectContaining({
      suggestedName: "copy.pdf",
      content: expect.any(Uint8Array),
    }));
  });

  it("materializes every PDF supplied at application startup", async () => {
    invokeMock.mockResolvedValue([{ documentId: "desktop-pdf-2", fileName: "launch.pdf", bytes: [37] }]);
    const files = await getDesktopStartupPdfs();

    expect(files).toHaveLength(1);
    expect(files[0].file.name).toBe("launch.pdf");
    expect(invokeMock).toHaveBeenCalledWith("get_startup_pdfs");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversionRequestError,
  normalizePdfUpload,
  requestConversion,
  type ConversionOptions,
} from "./conversion";

const options: ConversionOptions = {
  targetFormat: "docx",
  languages: "fra+eng",
  ocrMode: "auto",
  pages: "",
  imageDpi: 150,
  imageQuality: 85,
  docxMode: "visual",
};

function successfulResponse() {
  return {
    ok: true,
    headers: new Headers({
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="conversion.docx"',
      "x-conversion-input-bytes": "16",
      "x-conversion-output-bytes": "8",
      "x-conversion-pages": "1",
      "x-conversion-docx-mode": "visual",
    }),
    blob: vi.fn().mockResolvedValue(
      new Blob(["docx"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ),
  } as unknown as Response;
}

describe("conversion PDF upload normalization", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps a valid File and reports safe request diagnostics", async () => {
    const source = new File(["%PDF-1.7\nsource"], "source.pdf", {
      type: "application/pdf",
    });

    const normalized = await normalizePdfUpload(source);

    expect(normalized.file).toBe(source);
    expect(normalized.diagnostics).toEqual({
      fileName: "source.pdf",
      size: source.size,
      mimeType: "application/pdf",
      isBlob: true,
      hasPdfSignature: true,
    });
  });

  it("rebuilds an IndexedDB Blob as a named PDF File", async () => {
    const restoredBlob = new Blob(["%PDF-1.7\nrestored"], {
      type: "application/pdf",
    });

    const normalized = await normalizePdfUpload(
      restoredBlob,
      "document-restaure.pdf",
    );

    expect(normalized.file).toBeInstanceOf(File);
    expect(normalized.file.name).toBe("document-restaure.pdf");
    expect(normalized.file.size).toBe(restoredBlob.size);
    expect(await normalized.file.text()).toBe("%PDF-1.7\nrestored");
  });

  it.each([
    new Blob([], { type: "application/pdf" }),
    new Blob(["not a pdf"], { type: "application/pdf" }),
  ])("rejects an empty or invalid Blob before the network call", async (source) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestConversion(
        "http://localhost:8000",
        source,
        options,
        "invalid.pdf",
      ),
    ).rejects.toMatchObject({
      name: "ConversionRequestError",
      code: "INVALID_PDF",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the normalized file and every diagnostic option in FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
    vi.stubGlobal("fetch", fetchMock);
    const source = new Blob(["%PDF-1.7\nsource"], {
      type: "application/pdf",
    });

    await requestConversion(
      "http://localhost:8000",
      source,
      options,
      "restored.pdf",
    );

    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const form = request[1].body as FormData;
    const upload = form.get("file");
    expect(upload).toBeInstanceOf(File);
    expect((upload as File).name).toBe("restored.pdf");
    expect((upload as File).size).toBe(source.size);
    expect(form.get("target_format")).toBe("docx");
    expect(form.get("docx_mode")).toBe("visual");
    expect(form.get("ocr_mode")).toBe("auto");
    expect(form.get("languages")).toBe("fra+eng");
  });

  it("retains the backend failure stage for diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({
          code: "CONVERSION_FAILED",
          message: "La conversion a échoué.",
          stage: "docx_visual_generation",
        }),
      }),
    );

    let captured: unknown;
    try {
      await requestConversion(
        "http://localhost:8000",
        new File(["%PDF-1.7\nsource"], "source.pdf", {
          type: "application/pdf",
        }),
        options,
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ConversionRequestError);
    expect(captured).toMatchObject({
      code: "CONVERSION_FAILED",
      stage: "docx_visual_generation",
    });
  });
});

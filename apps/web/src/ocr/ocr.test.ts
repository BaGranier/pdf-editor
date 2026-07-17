import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDownloadFileName,
  getOcrFallbackFileName,
  requestOcrPdf,
  type OcrOptions,
} from "./ocr";

const DEFAULT_OPTIONS: OcrOptions = {
  languages: "fra",
  mode: "skip-text",
  deskew: true,
};

function createResponse({
  ok = true,
  blob = new Blob(["%PDF-1.7\nocr"], { type: "application/pdf" }),
  headers = new Headers(),
  json,
}: {
  ok?: boolean;
  blob?: Blob;
  headers?: Headers;
  json?: () => Promise<unknown>;
} = {}) {
  return {
    ok,
    blob: vi.fn().mockResolvedValue(blob),
    headers,
    json: json ?? vi.fn().mockResolvedValue({}),
  } as unknown as Response;
}

describe("OCR API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads standard and UTF-8 Content-Disposition file names", () => {
    expect(
      getDownloadFileName(
        'attachment; filename="standard_OCR.pdf"',
        "fallback.pdf",
      ),
    ).toBe("standard_OCR.pdf");
    expect(
      getDownloadFileName(
        "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''r%C3%A9sultat_OCR.pdf",
        "fallback.pdf",
      ),
    ).toBe("résultat_OCR.pdf");
  });

  it("builds the OCR fallback file name", () => {
    expect(getOcrFallbackFileName("source.pdf")).toBe("source_OCR.pdf");
    expect(getOcrFallbackFileName("document")).toBe("document_OCR.pdf");
  });

  it("sends the PDF and default options as multipart without a manual header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse());
    vi.stubGlobal("fetch", fetchMock);
    const source = new File(["%PDF-source"], "source.pdf", {
      type: "application/pdf",
    });

    const result = await requestOcrPdf(
      "http://localhost:8000/",
      source,
      DEFAULT_OPTIONS,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = request.body as FormData;
    expect(url).toBe("http://localhost:8000/ocr");
    expect(request.method).toBe("POST");
    expect(request.headers).toBeUndefined();
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toMatchObject({
      name: "source.pdf",
      type: "application/pdf",
    });
    expect(body.get("languages")).toBe("fra");
    expect(body.get("mode")).toBe("skip-text");
    expect(body.get("deskew")).toBe("true");
    expect(result).toMatchObject({
      name: "source_OCR.pdf",
      type: "application/pdf",
    });
  });

  it("sends bilingual forced OCR with deskew disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse());
    vi.stubGlobal("fetch", fetchMock);

    await requestOcrPdf(
      "http://localhost:8000",
      new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
      {
        languages: "fra+eng",
        mode: "force-ocr",
        deskew: false,
      },
    );

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(body.get("languages")).toBe("fra+eng");
    expect(body.get("mode")).toBe("force-ocr");
    expect(body.get("deskew")).toBe("false");
  });

  it.each([
    [
      { code: "OCR_FAILED", message: "Échec OCR fourni par le backend." },
      "Échec OCR fourni par le backend.",
    ],
    [
      {
        detail: {
          code: "OCR_LANGUAGE_UNAVAILABLE",
          message: "Langue absente fournie par le backend.",
        },
      },
      "Langue absente fournie par le backend.",
    ],
    [
      { code: "OCR_TOOL_UNAVAILABLE" },
      "Le moteur OCR n'est pas disponible.",
    ],
  ])("reads structured backend errors from %#", async (payload, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          ok: false,
          json: vi.fn().mockResolvedValue(payload),
        }),
      ),
    );

    await expect(
      requestOcrPdf(
        "http://localhost:8000",
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
        DEFAULT_OPTIONS,
      ),
    ).rejects.toThrow(expected);
  });

  it("uses a generic message for a non-JSON HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          ok: false,
          json: vi.fn().mockRejectedValue(new SyntaxError("not json")),
        }),
      ),
    );

    await expect(
      requestOcrPdf(
        "http://localhost:8000",
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
        DEFAULT_OPTIONS,
      ),
    ).rejects.toThrow("Le traitement OCR a échoué.");
  });

  it("uses an explicit message for a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(
      requestOcrPdf(
        "http://localhost:8000",
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
        DEFAULT_OPTIONS,
      ),
    ).rejects.toThrow("Impossible de contacter le moteur PDF.");
  });

  it.each([
    new Blob(["not a pdf"], { type: "application/pdf" }),
    new Blob(["%PDF-invalid-type"], { type: "text/html" }),
  ])("rejects successful responses that are not valid PDFs", async (blob) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(createResponse({ blob })),
    );

    await expect(
      requestOcrPdf(
        "http://localhost:8000",
        new File(["%PDF"], "scan.pdf", { type: "application/pdf" }),
        DEFAULT_OPTIONS,
      ),
    ).rejects.toThrow("Le serveur n'a pas produit un PDF valide.");
  });
});

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentProcessing } from "./useDocumentProcessing";
import { requestOcrPdf } from "../ocr/ocr";
import { downloadConversionFile, requestConversion, type ConversionOptions } from "../conversion/conversion";

vi.mock("../ocr/ocr", () => ({ requestOcrPdf: vi.fn() }));
vi.mock("../conversion/conversion", () => ({ requestConversion: vi.fn(), downloadConversionFile: vi.fn() }));

const ocrOptions = { languages: "fra+eng", deskew: true, rotation: 90 } as const;
const conversionOptions: ConversionOptions = {
  targetFormat: "txt", languages: "fra", ocrMode: "auto", pages: "",
  imageDpi: 150, imageQuality: 90, docxMode: "editable", outputFilename: "",
};
const source = { file: new File(["synthetic source"], "source.pdf"), fileName: "source.pdf" };

function setup(activeDocument: typeof source | null = source) {
  const onFeedback = vi.fn();
  const openGeneratedPdfDocument = vi.fn().mockResolvedValue({ usageWarnings: [] });
  const hook = renderHook(({ document }) => useDocumentProcessing({
    activeDocument: document, backendUrl: "http://local-engine",
    openGeneratedPdfDocument, onFeedback,
  }), { initialProps: { document: activeDocument } });
  return { ...hook, onFeedback, openGeneratedPdfDocument };
}

describe("document processing orchestration", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not start either treatment without a source", async () => {
    const { result } = setup(null);
    await act(async () => {
      await result.current.runOcrOnActiveDocument(ocrOptions);
      await result.current.convertActiveDocument(conversionOptions);
    });
    expect(requestOcrPdf).not.toHaveBeenCalled();
    expect(requestConversion).not.toHaveBeenCalled();
  });

  it("keeps the captured source through a document switch and blocks a second OCR while busy", async () => {
    let complete!: (file: File) => void;
    vi.mocked(requestOcrPdf).mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const { result, rerender, onFeedback, openGeneratedPdfDocument } = setup();
    let pending!: Promise<void>;
    act(() => { pending = result.current.runOcrOnActiveDocument(ocrOptions); });
    expect(result.current.isOcrProcessing).toBe(true);
    rerender({ document: { file: new File(["other"], "other.pdf"), fileName: "other.pdf" } });
    await act(async () => { await result.current.runOcrOnActiveDocument(ocrOptions); });
    expect(requestOcrPdf).toHaveBeenCalledExactlyOnceWith("http://local-engine", source.file, ocrOptions);
    const output = new File(["result"], "source_OCR.pdf");
    await act(async () => { complete(output); await pending; });
    expect(openGeneratedPdfDocument).toHaveBeenCalledExactlyOnceWith(output);
    expect(result.current.isOcrProcessing).toBe(false);
    expect(onFeedback.mock.calls.map(([feedback]) => feedback?.kind ?? null)).toEqual([null, "success"]);
  });

  it("reports an invalid OCR result and permits a new attempt", async () => {
    vi.mocked(requestOcrPdf).mockResolvedValue(new File(["invalid"], "result.pdf"));
    const { result, openGeneratedPdfDocument, onFeedback } = setup();
    openGeneratedPdfDocument.mockRejectedValueOnce(new Error("engine detail"));
    await act(async () => { await result.current.runOcrOnActiveDocument(ocrOptions); });
    expect(onFeedback).toHaveBeenLastCalledWith({ kind: "error", message: "Le serveur n'a pas produit un PDF valide." });
    expect(result.current.isOcrProcessing).toBe(false);
    await act(async () => { await result.current.runOcrOnActiveDocument(ocrOptions); });
    expect(onFeedback.mock.lastCall?.[0].kind).toBe("success");
  });

  it("downloads a conversion without reopening it and retains its warnings", async () => {
    const file = new File(["résultat"], "result.txt");
    vi.mocked(requestConversion).mockResolvedValue({ file, metadata: {
      format: "txt", durationMs: 1, inputBytes: 16, outputBytes: file.size,
      ocrUsed: true, pages: [1, 2], warnings: ["Witness warning"], textLayer: null, docxMode: null,
    } });
    const { result, onFeedback, openGeneratedPdfDocument } = setup();
    act(() => result.current.setIsConversionDialogOpen(true));
    await act(async () => { await result.current.convertActiveDocument(conversionOptions); });
    expect(requestConversion).toHaveBeenCalledExactlyOnceWith("http://local-engine", source.file, conversionOptions, source.fileName);
    expect(downloadConversionFile).toHaveBeenCalledExactlyOnceWith(file);
    expect(openGeneratedPdfDocument).not.toHaveBeenCalled();
    expect(onFeedback).toHaveBeenLastCalledWith({ kind: "warning", message: "Conversion réussie : result.txt (2 pages). OCR automatique utilisé. Avertissement : Witness warning" });
    expect(result.current.isConverting).toBe(false);
    expect(result.current.isConversionDialogOpen).toBe(false);
    act(() => {
      result.current.setIsOcrDialogOpen(true);
      result.current.setIsConversionDialogOpen(true);
    });
    act(() => result.current.resetDocumentProcessing());
    expect(result.current.isOcrDialogOpen || result.current.isConversionDialogOpen).toBe(false);
  });
});

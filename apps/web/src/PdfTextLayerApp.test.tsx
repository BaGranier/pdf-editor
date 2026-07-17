import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjsLib from "pdfjs-dist";
import { App } from "./App";
import { clearViewerStorage } from "./storage/viewerStorage";

type MockViewport = {
  width: number;
  height: number;
  scale: number;
  userUnit: number;
  rotation: number;
};

const pdfMock = vi.hoisted(() => ({
  textLayers: [] as Array<{
    options: {
      textContentSource: { text: string };
      container: HTMLDivElement;
      viewport: MockViewport;
    };
    cancel: ReturnType<typeof vi.fn>;
  }>,
  renderError: null as Error | null,
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  TextLayer: class TextLayerMock {
    textContentItemsStr: string[];
    options: {
      textContentSource: { text: string };
      container: HTMLDivElement;
      viewport: MockViewport;
    };
    cancel = vi.fn();

    constructor(options: {
      textContentSource: { text: string };
      container: HTMLDivElement;
      viewport: MockViewport;
    }) {
      this.options = options;
      this.textContentItemsStr = options.textContentSource.text
        ? [options.textContentSource.text]
        : [];
      pdfMock.textLayers.push(this);
    }

    async render() {
      if (pdfMock.renderError) {
        throw pdfMock.renderError;
      }
      if (!this.options.textContentSource.text) {
        return;
      }

      const span = document.createElement("span");
      span.textContent = this.options.textContentSource.text;
      this.options.container.append(span);
    }
  },
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "mock-pdf-worker-url",
}));

const createPdfDocumentMock = ({
  text = "Texte du PDF",
  rotation = 0,
}: {
  text?: string;
  rotation?: number;
} = {}) => {
  const viewports: MockViewport[] = [];
  const render = vi.fn((_parameters: { viewport: MockViewport }) => ({
    promise: Promise.resolve(),
    cancel: vi.fn(),
  }));
  const streamTextContent = vi.fn(() => ({ text }));
  const getViewport = vi.fn(({ scale }: { scale: number }) => {
    const viewport = {
      width: (rotation % 180 === 0 ? 600 : 800) * scale,
      height: (rotation % 180 === 0 ? 800 : 600) * scale,
      scale,
      userUnit: 1,
      rotation,
    };
    viewports.push(viewport);
    return viewport;
  });
  const page = {
    getViewport,
    render,
    streamTextContent,
  };
  const pdfDocument = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(page),
  };

  return {
    pdfDocument,
    page,
    render,
    streamTextContent,
    viewports,
  };
};

const usePdfDocument = (
  pdfDocument: ReturnType<typeof createPdfDocumentMock>["pdfDocument"],
) => {
  vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
    promise: Promise.resolve(pdfDocument),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as never);
};

const openPdf = async (fileName: string) => {
  const sidebar = screen.getByRole("complementary", {
    name: "Documents ouverts",
  });
  fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
    target: {
      files: [
        new File(["%PDF-1.7"], fileName, {
          type: "application/pdf",
        }),
      ],
    },
  });

  await waitFor(() => {
    expect(
      screen.getByRole("region", { name: `Aperçu PDF ${fileName}` }),
    ).toBeInTheDocument();
    expect(document.querySelector(".pdf-canvas")).toBeInTheDocument();
  });
};

describe("PDF.js text layer in App", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearViewerStorage();
    vi.clearAllMocks();
    pdfMock.textLayers.length = 0;
    pdfMock.renderError = null;
  });

  it("renders selectable transparent text above the canvas with the same viewport", async () => {
    const pdf = createPdfDocumentMock({ text: "Bonjour PDF", rotation: 90 });
    usePdfDocument(pdf.pdfDocument);
    render(<App />);

    await openPdf("digital.pdf");

    const layer = await waitFor(() => {
      const element = document.querySelector<HTMLDivElement>(".pdf-text-layer");
      expect(element).not.toBeNull();
      expect(element).not.toHaveAttribute("hidden");
      expect(element).toHaveTextContent("Bonjour PDF");
      return element as HTMLDivElement;
    });
    const span = within(layer).getByText("Bonjour PDF");
    const viewer = screen.getByRole("region", {
      name: "Aperçu PDF digital.pdf",
    });
    const canvasViewport = pdf.render.mock.calls[0]?.[0].viewport;

    expect(document.querySelector(".pdf-canvas")).toBeInTheDocument();
    expect(pdf.streamTextContent).toHaveBeenCalledWith({
      includeMarkedContent: true,
    });
    expect(pdfMock.textLayers[0]?.options.viewport).toBe(canvasViewport);
    expect(layer).toHaveClass("textLayer", "pdf-text-layer");
    expect(layer).toHaveStyle({ width: "800px", height: "600px" });
    expect(span).not.toHaveAttribute("style");
    expect(layer.querySelector(".endOfContent")).toBe(layer.lastElementChild);

    fireEvent.mouseDown(span, { button: 0, clientX: 20, clientY: 20 });
    expect(viewer).not.toHaveClass("is-panning");
    expect(layer).toHaveClass("selecting");
    fireEvent.pointerUp(document);
    expect(layer).not.toHaveClass("selecting");

    fireEvent.mouseDown(document.querySelector(".pdf-canvas") as Element, {
      button: 0,
      clientX: 20,
      clientY: 20,
    });
    expect(viewer).toHaveClass("is-panning");
  });

  it("rebuilds one aligned layer and cancels the previous one after zoom", async () => {
    const pdf = createPdfDocumentMock();
    usePdfDocument(pdf.pdfDocument);
    render(<App />);
    await openPdf("zoom.pdf");

    await waitFor(() => {
      expect(pdfMock.textLayers).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Augmenter le zoom" }));

    await waitFor(() => {
      expect(pdfMock.textLayers).toHaveLength(2);
      expect(document.querySelectorAll(".pdf-text-layer")).toHaveLength(1);
      expect(
        document.querySelectorAll(".pdf-text-layer span"),
      ).toHaveLength(1);
      expect(document.querySelectorAll(".endOfContent")).toHaveLength(1);
      const layer = document.querySelector<HTMLElement>(".pdf-text-layer");
      expect(layer?.style.width).toBe("660px");
      expect(Number.parseFloat(layer?.style.height ?? "")).toBeCloseTo(880);
    });
    expect(pdfMock.textLayers[1]?.options.viewport).toBe(
      pdf.render.mock.calls[1]?.[0].viewport,
    );
  });

  it("cleans the active layer on document changes and creates a fresh one", async () => {
    const firstPdf = createPdfDocumentMock({ text: "Premier document" });
    const secondPdf = createPdfDocumentMock({ text: "Second document" });
    usePdfDocument(firstPdf.pdfDocument);
    usePdfDocument(secondPdf.pdfDocument);
    render(<App />);

    await openPdf("first.pdf");
    await waitFor(() => {
      expect(screen.getByText("Premier document")).toBeInTheDocument();
    });
    await openPdf("second.pdf");

    await waitFor(() => {
      expect(screen.getByText("Second document")).toBeInTheDocument();
      expect(screen.queryByText("Premier document")).not.toBeInTheDocument();
      expect(document.querySelectorAll(".pdf-text-layer")).toHaveLength(1);
      expect(document.querySelectorAll(".endOfContent")).toHaveLength(1);
    });
  });

  it("does not render text layers in Organize mode and recreates them on return", async () => {
    const pdf = createPdfDocumentMock();
    usePdfDocument(pdf.pdfDocument);
    render(<App />);
    await openPdf("organize.pdf");
    await waitFor(() => {
      expect(pdfMock.textLayers).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    await waitFor(() => {
      expect(document.querySelector(".pdf-text-layer")).not.toBeInTheDocument();
      expect(document.querySelector(".endOfContent")).not.toBeInTheDocument();
      expect(
        screen.getByRole("region", {
          name: "Organiser les pages de organize.pdf",
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Revenir à la lecture" }),
    );

    await waitFor(() => {
      expect(pdfMock.textLayers).toHaveLength(2);
      expect(document.querySelector(".pdf-text-layer")).toBeInTheDocument();
      expect(document.querySelectorAll(".endOfContent")).toHaveLength(1);
    });
  });

  it("keeps a scan visible without an interaction-blocking empty layer", async () => {
    const pdf = createPdfDocumentMock({ text: "" });
    usePdfDocument(pdf.pdfDocument);
    render(<App />);

    await openPdf("scan.pdf");

    await waitFor(() => {
      expect(document.querySelector(".pdf-canvas")).toBeInTheDocument();
      expect(document.querySelector(".pdf-text-layer")).toHaveAttribute(
        "hidden",
      );
      expect(document.querySelector(".endOfContent")).not.toBeInTheDocument();
      expect(screen.queryByText("Impossible d'afficher cette page.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "OCR" })).toBeEnabled();
    });
  });

  it("keeps the canvas usable when only text-layer rendering fails", async () => {
    const consoleWarning = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    pdfMock.renderError = new Error("text rendering failed");
    const pdf = createPdfDocumentMock();
    usePdfDocument(pdf.pdfDocument);
    render(<App />);

    await openPdf("text-error.pdf");

    await waitFor(() => {
      expect(document.querySelector(".pdf-canvas")).toBeInTheDocument();
      expect(document.querySelector(".pdf-text-layer")).toHaveAttribute(
        "hidden",
      );
      expect(document.querySelector(".endOfContent")).not.toBeInTheDocument();
      expect(screen.queryByText("Impossible d'afficher cette page.")).not.toBeInTheDocument();
      expect(consoleWarning).toHaveBeenCalledWith(
        "Impossible de rendre la couche texte PDF.",
        pdfMock.renderError,
      );
    });
    consoleWarning.mockRestore();
  });
});

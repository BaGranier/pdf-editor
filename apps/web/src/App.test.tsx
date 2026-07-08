import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjsLib from "pdfjs-dist";
import { App } from "./App";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "mock-pdf-worker-url",
}));

function createPdfDocumentMock() {
  const page = {
    getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    })),
  };

  return {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue(page),
  };
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock()),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  it("renders the app shell and the main toolbar without crashing", () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PDF Editor MVP" })).toBeInTheDocument();
    expect(toolbar).toHaveClass("toolbar", "toolbar--sticky");
    expect(within(toolbar).getByLabelText("Ouvrir un PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();
  });

  it("opens a PDF, shows the tabs area, and exposes the active document", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "sample.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "Documents PDF" })).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "sample.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();
  });

  it("restores the saved scroll position for each PDF tab", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfA = new File(["%PDF-1.4"], "alpha.pdf", { type: "application/pdf" });
    const pdfB = new File(["%PDF-1.4"], "beta.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfA] } });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "alpha.pdf" })).toBeInTheDocument();
    });

    const alphaViewer = screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" });
    alphaViewer.scrollTop = 240;

    fireEvent.change(fileInput, { target: { files: [pdfB] } });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "beta.pdf" })).toBeInTheDocument();
    });

    const betaViewer = screen.getByRole("region", { name: "Aperçu PDF beta.pdf" });
    betaViewer.scrollTop = 80;

    fireEvent.click(screen.getByRole("tab", { name: "alpha.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" })).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" })).toHaveProperty(
      "scrollTop",
      240,
    );

    fireEvent.click(screen.getByRole("tab", { name: "beta.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF beta.pdf" })).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: "Aperçu PDF beta.pdf" })).toHaveProperty(
      "scrollTop",
      80,
    );
  });

  it("drops scroll state when a document is closed and reopened", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "gamma.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "gamma.pdf" })).toBeInTheDocument();
    });

    screen.getByRole("region", { name: "Aperçu PDF gamma.pdf" }).scrollTop = 190;

    fireEvent.click(screen.getByRole("button", { name: "Fermer gamma.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aucun PDF ouvert" })).toBeInTheDocument();
    });

    const emptyFileInput = within(screen.getByRole("region", { name: "Aucun PDF ouvert" })).getByLabelText(
      "Ouvrir un PDF",
    );

    fireEvent.change(emptyFileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF gamma.pdf" })).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: "Aperçu PDF gamma.pdf" })).toHaveProperty(
      "scrollTop",
      0,
    );
  });
});

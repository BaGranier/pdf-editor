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
    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "PDF Editor MVP" })).toBeInTheDocument();
    expect(toolbar).toHaveClass("toolbar", "toolbar--sticky");
    expect(within(toolbar).getByLabelText("Ouvrir un PDF")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByText("Aucun PDF ouvert.")).toBeInTheDocument();
  });

  it("opens PDFs in the sidebar and marks the active document", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "sample.pdf", { type: "application/pdf" });
    const secondPdf = new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Documents ouverts" })).toBeInTheDocument();
    });

    let sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    expect(within(sidebar).getByRole("button", { name: "sample.pdf, document actif" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [secondPdf] } });

    await waitFor(() => {
      sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
      expect(within(sidebar).getByRole("button", { name: "sample.pdf" })).toBeInTheDocument();
      expect(within(sidebar).getByRole("button", { name: "second.pdf, document actif" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });
  });

  it("restores the saved scroll position for each open document", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfA = new File(["%PDF-1.4"], "alpha.pdf", { type: "application/pdf" });
    const pdfB = new File(["%PDF-1.4"], "beta.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfA] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha.pdf, document actif" })).toBeInTheDocument();
    });

    const alphaViewer = screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" });
    alphaViewer.scrollTop = 240;
    fireEvent.scroll(alphaViewer);

    fireEvent.change(fileInput, { target: { files: [pdfB] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "beta.pdf, document actif" })).toBeInTheDocument();
    });

    const betaViewer = screen.getByRole("region", { name: "Aperçu PDF beta.pdf" });
    betaViewer.scrollTop = 80;
    fireEvent.scroll(betaViewer);

    fireEvent.click(screen.getByRole("button", { name: "alpha.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" })).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: "Aperçu PDF alpha.pdf" })).toHaveProperty(
      "scrollTop",
      240,
    );

    fireEvent.click(screen.getByRole("button", { name: "beta.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF beta.pdf" })).toBeInTheDocument();
    });

    expect(screen.getByRole("region", { name: "Aperçu PDF beta.pdf" })).toHaveProperty(
      "scrollTop",
      80,
    );
  });

  it("closes the active document and falls back to another open document", async () => {
    render(<App />);

    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const fileInput = within(toolbar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "gamma.pdf", { type: "application/pdf" });
    const otherPdf = new File(["%PDF-1.4"], "delta.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.change(fileInput, { target: { files: [otherPdf] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "delta.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Fermer delta.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Fermer gamma.pdf" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aucun PDF ouvert" })).toBeInTheDocument();
    });

    expect(screen.getByRole("complementary", { name: "Documents ouverts" })).toHaveTextContent(
      "Aucun document ouvert.",
    );
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjsLib from "pdfjs-dist";
import { App } from "./App";
import {
  clearViewerStorage,
  loadOrganizationPlan,
  loadViewerPreferences,
} from "./storage/viewerStorage";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "mock-pdf-worker-url",
}));

function createPdfDocumentMock(pageCount = 1) {
  const page = {
    getViewport: vi.fn(() => ({ width: 800, height: 1000 })),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
      cancel: vi.fn(),
    })),
  };

  return {
    numPages: pageCount,
    getPage: vi.fn().mockResolvedValue(page),
  };
}

describe("App", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearViewerStorage();
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
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masquer la barre latérale" })).toBeInTheDocument();
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByRole("switch", { name: "Basculer le thème" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(within(sidebar).getByLabelText("Ouvrir un PDF")).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Réinitialiser les données locales" })).toBeInTheDocument();
    expect(within(sidebar).getByText("Aucun PDF ouvert.")).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("opens PDFs in the sidebar and marks the active document", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "sample.pdf", { type: "application/pdf" });
    const secondPdf = new File(["%PDF-1.4"], "second.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Documents ouverts" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF sample.pdf" })).toHaveFocus();
    });

    let documentSidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    expect(within(documentSidebar).getByRole("button", { name: "sample.pdf, document actif" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Réduire le zoom" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Augmenter le zoom" })).toBeInTheDocument();

    fireEvent.change(fileInput, { target: { files: [secondPdf] } });

    await waitFor(() => {
      documentSidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
      expect(within(documentSidebar).getByRole("button", { name: "sample.pdf" })).toBeInTheDocument();
      expect(within(documentSidebar).getByRole("button", { name: "second.pdf, document actif" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });
  });

  it("navigates the sidebar with the keyboard and closes the focused document", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const pdfA = new File(["%PDF-1.4"], "alpha.pdf", { type: "application/pdf" });
    const pdfB = new File(["%PDF-1.4"], "beta.pdf", { type: "application/pdf" });
    const pdfC = new File(["%PDF-1.4"], "gamma.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfA] } });
    fireEvent.change(fileInput, { target: { files: [pdfB] } });
    fireEvent.change(fileInput, { target: { files: [pdfC] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    });

    fileInput.focus();
    fireEvent.keyDown(fileInput, { key: "Backspace" });

    expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();

    sidebar.focus();
    fireEvent.keyDown(sidebar, { key: "Home" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha.pdf, document actif" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });

    fireEvent.keyDown(sidebar, { key: "End" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });

    fireEvent.keyDown(sidebar, { key: "ArrowUp" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "beta.pdf, document actif" })).toHaveAttribute(
        "aria-current",
        "true",
      );
    });

    fireEvent.keyDown(sidebar, { key: "Delete" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "beta.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "beta.pdf, document actif" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
  });

  it("toggles the sidebar and the theme without losing the active document", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "gamma.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch", { name: "Basculer le thème" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(within(sidebar).getByRole("switch", { name: "Basculer le thème" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Masquer la barre latérale" }));

    expect(screen.queryByRole("complementary", { name: "Documents ouverts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afficher la barre latérale" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher la barre latérale" }));

    expect(screen.getByRole("complementary", { name: "Documents ouverts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "gamma.pdf, document actif" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Basculer le thème" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });

  it("scrolls fluidly with the arrow keys and supports mouse panning", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "scroll.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF scroll.pdf" })).toBeInTheDocument();
    });

    const viewer = screen.getByRole("region", { name: "Aperçu PDF scroll.pdf" });
    const scrollBySpy = vi.spyOn(viewer, "scrollBy");
    Object.defineProperty(viewer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(viewer, "scrollHeight", {
      configurable: true,
      value: 1600,
    });
    viewer.focus();

    viewer.scrollLeft = 24;
    viewer.scrollTop = 48;
    fireEvent.scroll(viewer);

    fireEvent.keyDown(viewer, { key: "ArrowRight" });
    fireEvent.keyDown(viewer, { key: "ArrowDown" });

    expect(scrollBySpy).toHaveBeenCalledWith({ left: 56, top: 0, behavior: "smooth" });
    expect(scrollBySpy).toHaveBeenCalledWith({ left: 0, top: 56, behavior: "smooth" });
    expect(viewer).toHaveProperty("scrollLeft", 80);
    expect(viewer).toHaveProperty("scrollTop", 104);

    fireEvent.keyDown(viewer, { key: "ArrowDown", shiftKey: true });

    expect(scrollBySpy).toHaveBeenCalledWith({ left: 0, top: 280, behavior: "smooth" });
    expect(viewer).toHaveProperty("scrollTop", 384);

    fireEvent.mouseDown(viewer, { button: 0, clientX: 100, clientY: 100 });

    await waitFor(() => {
      expect(viewer).toHaveClass("is-panning");
    });

    fireEvent.mouseMove(window, { clientX: 70, clientY: 60 });

    expect(viewer).toHaveProperty("scrollLeft", 110);
    expect(viewer).toHaveProperty("scrollTop", 424);

    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(viewer).not.toHaveClass("is-panning");
    });

    fireEvent.click(screen.getByRole("button", { name: "Masquer la barre latérale" }));
    fireEvent.click(screen.getByRole("button", { name: "Afficher la barre latérale" }));

    expect(screen.getByRole("region", { name: "Aperçu PDF scroll.pdf" })).toHaveProperty("scrollLeft", 110);
    expect(screen.getByRole("region", { name: "Aperçu PDF scroll.pdf" })).toHaveProperty("scrollTop", 424);
  });

  it("moves between PDF pages with PageUp and PageDown", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(3)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const pdfFile = new File(["%PDF-1.4"], "pages.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF pages.pdf" })).toBeInTheDocument();
    });

    const viewer = screen.getByRole("region", { name: "Aperçu PDF pages.pdf" });
    const scrollToSpy = vi.spyOn(viewer, "scrollTo");
    Object.defineProperty(viewer, "clientHeight", {
      configurable: true,
      value: 400,
    });

    const page1 = screen.getByLabelText("Page 1");
    const page2 = screen.getByLabelText("Page 2");
    const page3 = screen.getByLabelText("Page 3");

    Object.defineProperty(page1, "offsetTop", { configurable: true, value: 0 });
    Object.defineProperty(page1, "offsetHeight", { configurable: true, value: 900 });
    Object.defineProperty(page2, "offsetTop", { configurable: true, value: 1000 });
    Object.defineProperty(page2, "offsetHeight", { configurable: true, value: 900 });
    Object.defineProperty(page3, "offsetTop", { configurable: true, value: 2000 });
    Object.defineProperty(page3, "offsetHeight", { configurable: true, value: 900 });

    viewer.focus();

    fireEvent.keyDown(viewer, { key: "PageDown" });

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(viewer).toHaveProperty("scrollTop", 1000);
    expect(viewer).toHaveFocus();

    fireEvent.keyDown(viewer, { key: "PageDown" });

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 2000, behavior: "smooth" });
    expect(viewer).toHaveProperty("scrollTop", 2000);

    const callsBeforeBoundary = scrollToSpy.mock.calls.length;
    fireEvent.keyDown(viewer, { key: "PageDown" });
    expect(scrollToSpy).toHaveBeenCalledTimes(callsBeforeBoundary);
    expect(viewer).toHaveProperty("scrollTop", 2000);

    fireEvent.keyDown(viewer, { key: "PageUp" });

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    expect(viewer).toHaveProperty("scrollTop", 1000);

    fireEvent.keyDown(viewer, { key: "PageUp" });
    expect(viewer).toHaveProperty("scrollTop", 0);

    const callsBeforeFirstPage = scrollToSpy.mock.calls.length;
    fireEvent.keyDown(viewer, { key: "PageUp" });
    expect(scrollToSpy).toHaveBeenCalledTimes(callsBeforeFirstPage);
    expect(viewer).toHaveProperty("scrollTop", 0);
  });

  it("switches to organize mode and shows a grid for the active PDF", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(3)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(<App />);

    expect(screen.getByRole("button", { name: "Organiser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    expect(screen.getByText("Ouvrez un PDF pour organiser ses pages.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exporter le PDF" })).toBeDisabled();

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    fireEvent.change(fileInput, {
      target: { files: [new File(["%PDF-1.4"], "organize.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Organiser les pages de organize.pdf" })).toBeInTheDocument();
    });

    const grid = screen.getByLabelText("Grille des pages organisées");
    expect(within(grid).getAllByLabelText(/Miniature de la page source/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Revenir à la lecture" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Exporter le PDF" })).toBeEnabled();
    expect(screen.getByText("Ouvrez un autre PDF pour ajouter ses pages à la fin du plan.")).toBeInTheDocument();
  });

  it("keeps the single-document export compatible with the multi-source API", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["exported"], { type: "application/pdf" })),
      headers: new Headers({ "content-disposition": 'attachment; filename="edited.pdf"' }),
    });
    const createObjectUrl = vi.fn(() => "blob:exported-pdf");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const pdfFile = new File(["%PDF-1.4"], "export.pdf", { type: "application/pdf" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [pdfFile] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF export.pdf" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Exporter le PDF" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData; method: string }];
    const plan = JSON.parse(String(request.body.get("plan"))) as {
      outputName: string;
      saveToOutputDir: boolean;
      pages: Array<{ sourceDocumentId: string; sourcePageIndex: number; rotation: number }>;
    };
    const documentIds = JSON.parse(String(request.body.get("documentIds"))) as string[];

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/pdf/export/organize");
    expect(request.method).toBe("POST");
    expect(request.body.getAll("files")).toHaveLength(1);
    expect(request.body.getAll("files")[0]).toMatchObject({
      name: "export.pdf",
      type: "application/pdf",
    });
    expect(documentIds).toHaveLength(1);
    expect(plan).toEqual({
      outputName: "export-modifie.pdf",
      saveToOutputDir: false,
      pages: [
        { sourceDocumentId: documentIds[0], sourcePageIndex: 0, rotation: 0 },
        { sourceDocumentId: documentIds[0], sourcePageIndex: 1, rotation: 0 },
      ],
    });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("PDF exporté : edited.pdf");

    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it("appends selected or all external pages and exports every required source", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
    const fetchMock = vi.fn().mockRejectedValue(new Error("Backend indisponible"));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "alpha.pdf", { type: "application/pdf" }),
          new File(["%PDF-1.4"], "beta.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha.pdf" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "alpha.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    expect(screen.getByRole("button", { name: "Ajouter depuis un PDF ouvert" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter depuis un PDF ouvert" }));
    expect(screen.getByRole("combobox", { name: "PDF source externe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tout ajouter" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Insérer avant la page sélectionnée" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Insérer après la page sélectionnée" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Ajouter beta.pdf, page 2"));
    expect(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" }));

    await waitFor(() => {
      expect(screen.getByText("beta.pdf — p. 2")).toBeInTheDocument();
      expect(screen.getByLabelText("Grille des pages organisées").querySelectorAll(".organize-page")).toHaveLength(3);
    });

    fireEvent.click(screen.getByRole("button", { name: "Tout ajouter" }));

    await waitFor(() => {
      expect(screen.getByText("beta.pdf — p. 1")).toBeInTheDocument();
      expect(screen.getAllByText("beta.pdf — p. 2")).toHaveLength(2);
      expect(screen.getByLabelText("Grille des pages organisées").querySelectorAll(".organize-page")).toHaveLength(5);
    });

    fireEvent.click(screen.getByLabelText("Copier dans data/output"));
    fireEvent.click(screen.getByRole("button", { name: "Exporter le PDF" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const documentIds = JSON.parse(String(request.body.get("documentIds"))) as string[];
    const plan = JSON.parse(String(request.body.get("plan"))) as {
      saveToOutputDir: boolean;
      pages: Array<{ sourceDocumentId: string; sourcePageIndex: number }>;
    };

    expect(request.body.getAll("files")).toHaveLength(2);
    expect(plan.saveToOutputDir).toBe(true);
    expect(plan.pages).toEqual([
      { sourceDocumentId: documentIds[0], sourcePageIndex: 0, rotation: 0 },
      { sourceDocumentId: documentIds[0], sourcePageIndex: 1, rotation: 0 },
      { sourceDocumentId: documentIds[1], sourcePageIndex: 1, rotation: 0 },
      { sourceDocumentId: documentIds[1], sourcePageIndex: 0, rotation: 0 },
      { sourceDocumentId: documentIds[1], sourcePageIndex: 1, rotation: 0 },
    ]);
    expect(new Set(plan.pages.map((page) => page.sourceDocumentId))).toEqual(new Set(documentIds));
    expect(screen.getByRole("status")).toHaveTextContent("Erreur d'export : Backend indisponible");

    vi.unstubAllGlobals();
  });

  it("exports a persisted multi-document plan with files restored after a remount", async () => {
    vi.mocked(pdfjsLib.getDocument).mockImplementation(() => ({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    }) as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["exported"], { type: "application/pdf" })),
      headers: new Headers({ "content-disposition": 'attachment; filename="restored.pdf"' }),
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:restored-export"),
      revokeObjectURL: vi.fn(),
    });

    const { unmount } = render(<App />);
    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-alpha"], "alpha-restored.pdf", { type: "application/pdf" }),
          new File(["%PDF-beta"], "beta-restored.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha-restored.pdf" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "alpha-restored.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter depuis un PDF ouvert" }));
    fireEvent.click(screen.getByLabelText("Ajouter beta-restored.pdf, page 2"));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" }));

    await waitFor(() => {
      const activeDocumentId = loadViewerPreferences()?.activeDocumentId;
      expect(activeDocumentId).not.toBeNull();
      expect(loadOrganizationPlan(activeDocumentId ?? "")?.plan.pages).toHaveLength(3);
    });
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    unmount();

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF alpha-restored.pdf" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    await waitFor(() => {
      expect(screen.getByText("beta-restored.pdf — p. 2")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Exporter le PDF" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const restoredFiles = request.body.getAll("files") as File[];
    const documentIds = JSON.parse(String(request.body.get("documentIds"))) as string[];
    const plan = JSON.parse(String(request.body.get("plan"))) as {
      pages: Array<{ sourceDocumentId: string; sourcePageIndex: number }>;
    };

    expect(restoredFiles.map((file) => file.name)).toEqual([
      "alpha-restored.pdf",
      "beta-restored.pdf",
    ]);
    expect(restoredFiles.map((file) => file.size)).toEqual([10, 9]);
    expect(documentIds).toHaveLength(2);
    expect(plan.pages.map((page) => page.sourcePageIndex)).toEqual([0, 1, 1]);
    expect(new Set(plan.pages.map((page) => page.sourceDocumentId))).toEqual(new Set(documentIds));
    expect(screen.getByRole("status")).toHaveTextContent("PDF exporté : restored.pdf");

    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it("updates the local organization plan, resets it, and returns to reading mode", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(3)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [new File(["%PDF-1.4"], "plan.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF plan.pdf" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Grille des pages organisées")).toBeInTheDocument();
    });

    let grid = screen.getByLabelText("Grille des pages organisées");
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Sélectionner la page 1",
    })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Tourner la page 1 vers la droite",
    })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Déplacer la page 1 vers la gauche",
    })).toBeDisabled();
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Déplacer la page 1 vers la droite",
    })).toBeInTheDocument();
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Supprimer la page 1",
    })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Début" })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText("Page 2")).getByRole("button", {
      name: "Déplacer la page 2 vers la gauche",
    }));

    await waitFor(() => {
      const thumbnails = Array.from(grid.querySelectorAll(".organize-thumbnail"));
      expect(thumbnails.map((thumbnail) => thumbnail.getAttribute("aria-label"))).toEqual([
        "Miniature de la page source 2",
        "Miniature de la page source 1",
        "Miniature de la page source 3",
      ]);
    });

    fireEvent.click(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Tourner la page 1 vers la droite",
    }));
    expect(screen.getByText("Rotation : 90°")).toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Sélectionner la page 1",
    }));
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Sélectionner la page 1",
    })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(screen.getByLabelText("Page 2")).getByRole("button", {
      name: "Supprimer la page 2",
    }));

    await waitFor(() => {
      expect(within(grid).queryByLabelText("Miniature de la page source 1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Modifications en attente")).toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Dupliquer la page 1",
    }));

    await waitFor(() => {
      grid = screen.getByLabelText("Grille des pages organisées");
      expect(within(grid).getAllByLabelText("Miniature de la page source 2")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser l'organisation" }));

    await waitFor(() => {
      expect(within(grid).getAllByLabelText(/Miniature de la page source/)).toHaveLength(3);
      expect(within(grid).getAllByLabelText("Miniature de la page source 1")).toHaveLength(1);
    });
    expect(screen.getByText("Ordre d'origine")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revenir à la lecture" }));
    expect(screen.getByRole("region", { name: "Aperçu PDF plan.pdf" })).toBeInTheDocument();
  });

  it("restores a persisted organization plan with its rotation and selection", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(3)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    const { unmount } = render(<App />);
    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [new File(["%PDF-1.4"], "saved-plan.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF saved-plan.pdf" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    await waitFor(() => {
      expect(screen.getByLabelText("Grille des pages organisées")).toBeInTheDocument();
    });

    fireEvent.click(within(screen.getByLabelText("Page 2")).getByRole("button", {
      name: "Tourner la page 2 vers la droite",
    }));
    fireEvent.click(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Supprimer la page 1",
    }));
    fireEvent.click(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Sélectionner la page 1",
    }));

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    unmount();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF saved-plan.pdf" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Miniature de la page source 1")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Rotation : 90°")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Page 1")).getByRole("button", {
      name: "Sélectionner la page 1",
    })).toHaveAttribute("aria-pressed", "true");
  });

  it("restores persisted viewer preferences and documents after a remount", async () => {
    const { unmount } = render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const firstPdf = new File(["%PDF-1.4"], "persist-a.pdf", { type: "application/pdf" });
    const secondPdf = new File(["%PDF-1.4"], "persist-b.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [firstPdf, secondPdf] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "persist-b.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("switch", { name: "Basculer le thème" }));
    fireEvent.click(screen.getByRole("button", { name: "Masquer la barre latérale" }));

    await waitFor(() => {
      expect(loadViewerPreferences()?.theme).toBe("dark");
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    unmount();

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF persist-b.pdf" })).toBeInTheDocument();
    });

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(screen.queryByRole("complementary", { name: "Documents ouverts" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Afficher la barre latérale" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher la barre latérale" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "persist-b.pdf, document actif" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "persist-a.pdf" })).toBeInTheDocument();
  });

  it("clears local data after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    const fileInput = within(sidebar).getByLabelText("Ouvrir un PDF");
    const firstPdf = new File(["%PDF-1.4"], "clear-a.pdf", { type: "application/pdf" });
    const secondPdf = new File(["%PDF-1.4"], "clear-b.pdf", { type: "application/pdf" });

    fireEvent.change(fileInput, { target: { files: [firstPdf, secondPdf] } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "clear-b.pdf, document actif" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les données locales" }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "clear-b.pdf, document actif" })).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser les données locales" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aucun PDF ouvert" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Masquer la barre latérale" })).toBeInTheDocument();

    confirmSpy.mockRestore();
    expect(loadViewerPreferences()).toEqual(
      expect.objectContaining({
        sidebarVisible: true,
      }),
    );
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as pdfjsLib from "pdfjs-dist";
import { App } from "./App";
import {
  clearViewerStorage,
  loadOrganizationPlan,
  loadViewerPreferences,
  saveStoredDocument,
  saveViewerPreferences,
} from "./storage/viewerStorage";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
  TextLayer: class TextLayerMock {
    textContentItemsStr: string[] = [];
    render = vi.fn().mockResolvedValue(undefined);
    cancel = vi.fn();
  },
}));

vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "mock-pdf-worker-url",
}));

function createPdfDocumentMock(pageCount = 1) {
  const page = {
    view: [0, 0, 800, 1000],
    getViewport: vi.fn(({ scale = 1 }: { scale?: number } = {}) => ({
      width: 800 * scale,
      height: 1000 * scale,
      scale,
      userUnit: 1,
      rotation: 0,
      viewBox: [0, 0, 800, 1000],
      transform: [scale, 0, 0, -scale, 0, 1000 * scale],
      convertToPdfPoint: (x: number, y: number) => [x / scale, 1000 - y / scale],
      convertToViewportPoint: (x: number, y: number) => [x * scale, (1000 - y) * scale],
    })),
    streamTextContent: vi.fn(() => new ReadableStream()),
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

function selectInsertTool(tool: "Texte" | "Signature") {
  fireEvent.click(
    screen.getByRole("button", {
      name: tool === "Texte" ? "Ajouter du texte" : "Ajouter une signature",
    }),
  );
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

  it("warns without blocking when an opened PDF exceeds the recommended page limit", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(251)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [new File(["%PDF-1.4"], "long.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "long.pdf, document actif" })).toBeInTheDocument();
      expect(screen.getByText(/long\.pdf contient 251 pages, au-delà des 250 recommandées/)).toBeInTheDocument();
    });
  });

  it("keeps local reset available after a persistence warning", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [new File(["%PDF-1.4"], "session-only.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Les PDF ne peuvent pas être conservés durablement");
    });

    fireEvent.click(within(sidebar).getByRole("button", { name: "Réinitialiser les données locales" }));

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aucun PDF ouvert" })).toBeInTheDocument();
    });
    expect(confirm).toHaveBeenCalledOnce();
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

  it("supports Ctrl/Cmd wheel zoom and Home/End navigation in the viewer", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: { files: [new File(["%PDF-1.4"], "shortcuts.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF shortcuts.pdf" })).toBeInTheDocument();
    });

    const viewer = screen.getByRole("region", { name: "Aperçu PDF shortcuts.pdf" });
    Object.defineProperty(viewer, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(viewer, "scrollHeight", { configurable: true, value: 1600 });
    viewer.scrollTop = 500;
    viewer.focus();

    fireEvent.wheel(viewer, { ctrlKey: true, deltaY: -20 });
    expect(screen.getByText("110%")).toBeInTheDocument();

    fireEvent.keyDown(viewer, { key: "Home" });
    expect(viewer).toHaveProperty("scrollTop", 0);

    fireEvent.keyDown(viewer, { key: "End" });
    expect(viewer).toHaveProperty("scrollTop", 1200);
  });

  it("adds, edits, styles, moves, zooms and deletes free text blocks", async () => {
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "texte.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Couche d'édition de la page 1")).toBeInTheDocument();
    });

    selectInsertTool("Texte");
    expect(screen.getByRole("button", { name: "Ajouter du texte" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByLabelText("Couche d'édition de la page 1"), {
      clientX: 100,
      clientY: 150,
    });

    const input = await screen.findByLabelText("Texte ajouté page 1");
    fireEvent.change(input, { target: { value: "Été 2026 : 42,50 !" } });
    fireEvent.change(screen.getByLabelText("Police du texte"), {
      target: { value: "Times" },
    });
    fireEvent.change(screen.getByLabelText("Taille du texte"), {
      target: { value: "24" },
    });
    fireEvent.change(screen.getByLabelText("Couleur du texte"), {
      target: { value: "#c026d3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Gras" }));

    expect(input).toHaveValue("Été 2026 : 42,50 !");
    expect(input).toHaveStyle({
      color: "#c026d3",
      fontFamily: "Times",
      fontSize: "24px",
      fontWeight: "700",
    });

    const block = input.closest<HTMLElement>(".pdf-text-edit");
    expect(block).not.toBeNull();
    expect(block).toHaveStyle({ left: "100px", top: "150px" });

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Déplacer le bloc de texte page 1" }),
      { button: 0, clientX: 100, clientY: 150 },
    );
    fireEvent.mouseMove(window, { clientX: 140, clientY: 170 });
    fireEvent.mouseUp(window);

    expect(block).toHaveStyle({ left: "140px", top: "170px" });

    fireEvent.click(screen.getByRole("button", { name: "Augmenter le zoom" }));

    await waitFor(() => {
      expect(block).toHaveStyle({ left: "154px", top: "187px" });
      expect(input).toHaveStyle({ fontSize: "26.4px" });
    });
    expect(input).toHaveValue("Été 2026 : 42,50 !");

    fireEvent.click(screen.getByRole("button", { name: "Supprimer le bloc" }));
    expect(screen.queryByLabelText("Texte ajouté page 1")).not.toBeInTheDocument();
  });

  it("renders a compact header and keeps selection implicit with Escape", async () => {
    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "cycle.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    const toolbar = screen.getByRole("region", { name: "Contrôles PDF" });
    const saveAsButton = screen.getByRole("button", { name: "Enregistrer sous…" });
    const textButton = screen.getByRole("button", { name: "Ajouter du texte" });
    const signatureButton = screen.getByRole("button", { name: "Ajouter une signature" });

    expect(within(toolbar).queryByText("cycle.pdf")).not.toBeInTheDocument();
    expect(within(toolbar).queryByText("1 page")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("cycle.pdf")).toBeInTheDocument();
    expect(within(sidebar).getByText("1 page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sélection" })).not.toBeInTheDocument();
    expect(saveAsButton).toBeDisabled();
    expect(saveAsButton).toHaveAttribute("title", "Enregistrer sous… (Ctrl+Shift+S)");
    expect(textButton).toHaveAttribute("title", "Ajouter du texte");
    expect(signatureButton).toHaveAttribute("title", "Ajouter une signature");
    fireEvent.click(screen.getByRole("button", { name: "Augmenter le zoom" }));
    expect(saveAsButton).toBeDisabled();
    expect(screen.queryByTitle("Modifications non sauvegardées")).not.toBeInTheDocument();

    fireEvent.click(textButton);
    expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
    expect(textButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(layer).toHaveAttribute("data-active-editing-tool", "select");
    expect(textButton).toHaveAttribute("aria-pressed", "false");
    expect(saveAsButton).toBeDisabled();

    fireEvent.click(signatureButton);
    expect(screen.getByRole("dialog", { name: /Ajouter une signature/ })).toBeInTheDocument();
    expect(signatureButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /Ajouter une signature/ })).not.toBeInTheDocument();
    expect(layer).toHaveAttribute("data-active-editing-tool", "select");
    expect(signatureButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(textButton);

    fireEvent.click(layer, { clientX: 80, clientY: 100 });
    expect(layer).toHaveAttribute("data-active-editing-tool", "select");
    expect(saveAsButton).toBeEnabled();
    expect(screen.getByTitle("Modifications non sauvegardées")).toHaveTextContent("●");
    expect(
      screen.getByRole("button", { name: "cycle.pdf, document actif" }),
    ).toHaveAccessibleDescription("Modifications non sauvegardées.");
    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnloadEvent);
    expect(beforeUnloadEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Fichier/ }));
    const fileMenu = screen.getByRole("menu", { name: "Fichier" });
    expect(within(fileMenu).getAllByRole("menuitem")).toHaveLength(1);
    expect(
      within(fileMenu).getByRole("menuitem", { name: "Enregistrer sous…" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sauvegarder")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Fichier" })).not.toBeInTheDocument();
  });

  it("keeps a failed save dirty and uses the same workflow for Ctrl+S", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValue(
          new Blob(["saved-pdf"], { type: "application/pdf" }),
        ),
        headers: new Headers({
          "content-disposition": 'attachment; filename="save-cycle-modifie.pdf"',
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValue(
          new Blob(["saved-pdf-2"], { type: "application/pdf" }),
        ),
        headers: new Headers({
          "content-disposition": 'attachment; filename="save-cycle-modifie-2.pdf"',
        }),
      } as unknown as Response);
    const createObjectUrl = vi.fn(() => "blob:saved-pdf");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "save-cycle.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 70, clientY: 90 });
    fireEvent.change(await screen.findByLabelText("Texte ajouté page 1"), {
      target: { value: "À sauvegarder" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer sous…" }));
    let saveAsDialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    fireEvent.click(within(saveAsDialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    saveAsDialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    expect(within(saveAsDialog).getByRole("alert")).toHaveTextContent(
      "Erreur du backend : save failed",
    );
    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeEnabled();
    expect(screen.getByTitle("Modifications non sauvegardées")).toBeInTheDocument();
    fireEvent.click(within(saveAsDialog).getByRole("button", { name: "Annuler" }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    const shortcutWasNotCancelled = fireEvent.keyDown(window, {
      key: "s",
      ctrlKey: true,
    });
    expect(shortcutWasNotCancelled).toBe(false);
    saveAsDialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    fireEvent.click(within(saveAsDialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("region", {
          name: "Aperçu PDF save-cycle-modifie.pdf",
        }),
      ).toBeInTheDocument();
    });
    const originalButton = screen.getByRole("button", {
      name: "save-cycle.pdf",
    });
    expect(originalButton).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "PDF sauvegardé avec succès",
    );
    const [, successfulRequest] = fetchMock.mock.calls[1] as [
      string,
      { body: FormData },
    ];
    const plan = JSON.parse(String(successfulRequest.body.get("plan"))) as {
      edits: Array<{ text: string }>;
      saveToOutputDir: boolean;
    };
    expect(plan.edits).toEqual([
      expect.objectContaining({ text: "À sauvegarder" }),
    ]);
    expect(plan.saveToOutputDir).toBe(false);

    const reopenedLayer = await screen.findByLabelText(
      "Couche d'édition de la page 1",
    );
    selectInsertTool("Texte");
    fireEvent.click(reopenedLayer, { clientX: 40, clientY: 60 });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const macShortcutWasNotCancelled = fireEvent.keyDown(window, {
      key: "S",
      metaKey: true,
    });
    expect(macShortcutWasNotCancelled).toBe(false);
    saveAsDialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    fireEvent.click(within(saveAsDialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it("saves under a chosen normalized name and reuses it for the next save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValue(
          new Blob(["saved-as-pdf"], { type: "application/pdf" }),
        ),
        headers: new Headers(),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        blob: vi.fn().mockResolvedValue(
          new Blob(["saved-again-pdf"], { type: "application/pdf" }),
        ),
        headers: new Headers(),
      } as unknown as Response);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:saved-as-pdf"),
      revokeObjectURL: vi.fn(),
    });

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "contrat.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 70, clientY: 90 });
    fireEvent.change(await screen.findByLabelText("Texte ajouté page 1"), {
      target: { value: "Version client" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Fichier/ }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Enregistrer sous…" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    const nameInput = within(dialog).getByLabelText("Nom du fichier");
    expect(nameInput).toHaveValue("contrat-modifie.pdf");

    fireEvent.change(nameInput, { target: { value: ".pdf" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Saisissez un nom de fichier",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(nameInput, {
      target: { value: "contrat client (été).PDF" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("button", {
          name: "contrat client (été).pdf, document actif",
        }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", { name: "Enregistrer sous" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeDisabled();

    const [, saveAsRequest] = fetchMock.mock.calls[0] as [
      string,
      { body: FormData },
    ];
    expect(
      JSON.parse(String(saveAsRequest.body.get("plan"))).outputName,
    ).toBe("contrat client (été).pdf");

    const reopenedLayer = await screen.findByLabelText(
      "Couche d'édition de la page 1",
    );
    selectInsertTool("Texte");
    fireEvent.click(reopenedLayer, { clientX: 40, clientY: 60 });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    const nextSaveDialog = screen.getByRole("dialog", {
      name: "Enregistrer sous",
    });
    expect(within(nextSaveDialog).getByLabelText("Nom du fichier")).toHaveValue(
      "contrat client (été).pdf",
    );
    fireEvent.click(
      within(nextSaveDialog).getByRole("button", { name: "Enregistrer" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, nextSaveRequest] = fetchMock.mock.calls[1] as [
      string,
      { body: FormData },
    ];
    expect(
      JSON.parse(String(nextSaveRequest.body.get("plan"))).outputName,
    ).toBe("contrat client (été).pdf");

    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it("keeps the current dirty document unchanged when Save As is cancelled or fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("save as failed"));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [new File(["%PDF-1.4"], "annulation.pdf", { type: "application/pdf" })],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 70, clientY: 90 });

    fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true });
    let dialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    fireEvent.change(within(dialog).getByLabelText("Nom du fichier"), {
      target: { value: "nom-annule.pdf" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog", { name: "Enregistrer sous" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "annulation.pdf, document actif" })).toHaveAccessibleDescription(
      "Modifications non sauvegardées.",
    );

    const metaShortcutWasNotCancelled = fireEvent.keyDown(window, {
      key: "s",
      metaKey: true,
      shiftKey: true,
    });
    expect(metaShortcutWasNotCancelled).toBe(false);
    dialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    fireEvent.change(within(dialog).getByLabelText("Nom du fichier"), {
      target: { value: "échec final" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    dialog = screen.getByRole("dialog", { name: "Enregistrer sous" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Erreur du backend : save as failed",
    );
    expect(screen.getByRole("button", { name: "annulation.pdf, document actif" })).toHaveAccessibleDescription(
      "Modifications non sauvegardées.",
    );
    expect(screen.queryByRole("button", { name: /échec final\.pdf/ })).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("protects dirty document closure with cancel and discard actions", async () => {
    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "dirty-close.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 50, clientY: 70 });

    fireEvent.click(screen.getByRole("button", { name: "Fermer dirty-close.pdf" }));
    let dialog = screen.getByRole("dialog", {
      name: "Modifications non sauvegardées",
    });
    expect(dialog).toHaveTextContent(
      "dirty-close.pdf contient des modifications non sauvegardées",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog", { name: "Modifications non sauvegardées" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dirty-close.pdf, document actif" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Fermer dirty-close.pdf" }));
    dialog = screen.getByRole("dialog", {
      name: "Modifications non sauvegardées",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Ignorer les modifications" }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "dirty-close.pdf" })).not.toBeInTheDocument();
    });
  });

  it("saves a dirty document before closing it when requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(
        new Blob(["saved-before-close"], { type: "application/pdf" }),
      ),
      headers: new Headers({
        "content-disposition": 'attachment; filename="close-save-modifie.pdf"',
      }),
    } as unknown as Response);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:saved-before-close"),
      revokeObjectURL: vi.fn(),
    });

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "close-save.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 60, clientY: 80 });
    fireEvent.change(await screen.findByLabelText("Texte ajouté page 1"), {
      target: { value: "Sauver avant fermeture" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Fermer close-save.pdf" }));
    const dialog = screen.getByRole("dialog", {
      name: "Modifications non sauvegardées",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Enregistrer sous…" }),
    );
    const saveAsDialog = screen.getByRole("dialog", {
      name: "Enregistrer sous",
    });
    fireEvent.click(
      within(saveAsDialog).getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(screen.queryByRole("button", { name: "close-save.pdf" })).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", {
          name: "close-save-modifie.pdf, document actif",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("dialog", { name: "Modifications non sauvegardées" })).not.toBeInTheDocument();

    anchorClick.mockRestore();
    vi.unstubAllGlobals();
  });

  it("exports text operations for several source pages", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
    const fetchMock = vi.fn().mockRejectedValue(new Error("stop after request"));
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "multi-texte.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Couche d'édition de la page 2")).toBeInTheDocument();
    });
    selectInsertTool("Texte");
    fireEvent.click(screen.getByLabelText("Couche d'édition de la page 1"), {
      clientX: 60,
      clientY: 80,
    });
    fireEvent.change(screen.getByLabelText("Texte ajouté page 1"), {
      target: { value: "Premier bloc" },
    });
    selectInsertTool("Texte");
    fireEvent.click(screen.getByLabelText("Couche d'édition de la page 2"), {
      clientX: 120,
      clientY: 140,
    });
    fireEvent.change(screen.getByLabelText("Texte ajouté page 2"), {
      target: { value: "Deuxième bloc" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Exporter le PDF" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const plan = JSON.parse(String(request.body.get("plan"))) as {
      edits: Array<{
        type: string;
        page: number;
        text: string;
        sourceDocumentId: string;
        rect: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };

    expect(plan.edits).toHaveLength(2);
    expect(plan.edits.map((edit) => [edit.page, edit.text])).toEqual([
      [1, "Premier bloc"],
      [2, "Deuxième bloc"],
    ]);
    expect(plan.edits[0].sourceDocumentId).toBeTruthy();
    expect(plan.edits[0].rect).toEqual({
      x0: 60,
      y0: 848,
      x1: 280,
      y1: 920,
    });

    vi.unstubAllGlobals();
  });

  it("draws, places, moves, resizes, zooms and deletes a visual signature", async () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      strokeStyle: "#000000",
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,c2lnbmF0dXJl");

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-1.4"], "signature.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });
    await screen.findByLabelText("Couche d'édition de la page 1");

    selectInsertTool("Signature");
    const canvas = screen.getByLabelText("Zone de dessin de la signature");
    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100, clientY: 40 });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));

    expect(screen.getByRole("button", { name: "Ajouter une signature" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const editLayer = screen.getByLabelText("Couche d'édition de la page 1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(editLayer).toHaveAttribute("data-active-editing-tool", "select");
    expect(screen.queryByAltText("Signature visuelle page 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeDisabled();

    selectInsertTool("Signature");
    const secondCanvas = screen.getByLabelText("Zone de dessin de la signature");
    fireEvent.pointerDown(secondCanvas, {
      button: 0,
      pointerId: 2,
      pointerType: "mouse",
      clientX: 12,
      clientY: 12,
    });
    fireEvent.pointerMove(secondCanvas, { pointerId: 2, clientX: 95, clientY: 38 });
    fireEvent.pointerUp(secondCanvas, { pointerId: 2, clientX: 95, clientY: 38 });
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));
    fireEvent.click(editLayer, {
      clientX: 100,
      clientY: 150,
    });

    const signature = await screen.findByAltText("Signature visuelle page 1");
    const block = signature.closest<HTMLElement>(".pdf-signature-edit");
    expect(block).toHaveStyle({
      left: "100px",
      top: "150px",
      width: "180px",
      height: "60px",
    });

    fireEvent.mouseDown(block!, { button: 0, clientX: 100, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 170 });
    fireEvent.mouseUp(window);
    expect(block).toHaveStyle({ left: "140px", top: "170px" });

    fireEvent.mouseDown(
      screen.getByRole("button", { name: "Redimensionner la signature page 1" }),
      { button: 0, clientX: 320, clientY: 230 },
    );
    fireEvent.mouseMove(window, { clientX: 410, clientY: 260 });
    fireEvent.mouseUp(window);
    expect(block).toHaveStyle({ width: "270px", height: "90px" });

    fireEvent.click(screen.getByRole("button", { name: "Augmenter le zoom" }));
    await waitFor(() => {
      expect(block).toHaveStyle({
        left: "154px",
        top: "187px",
        width: "297px",
        height: "99px",
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Supprimer la signature page 1" }),
    );
    expect(
      screen.queryByAltText("Signature visuelle page 1"),
    ).not.toBeInTheDocument();

    getContext.mockRestore();
    toDataUrl.mockRestore();
  });

  it("exports signature placement and its local image payload", async () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context);
    const toDataUrl = vi
      .spyOn(HTMLCanvasElement.prototype, "toDataURL")
      .mockReturnValue("data:image/png;base64,c2lnbmF0dXJl");
    const fetchMock = vi.fn().mockRejectedValue(new Error("stop after request"));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [new File(["%PDF-1.4"], "signed.pdf", { type: "application/pdf" })],
      },
    });
    await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Signature");
    const canvas = screen.getByLabelText("Zone de dessin de la signature");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));
    fireEvent.click(screen.getByLabelText("Couche d'édition de la page 1"), {
      clientX: 75,
      clientY: 125,
    });

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Exporter le PDF" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, request] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const plan = JSON.parse(String(request.body.get("plan"))) as {
      signatures: Array<{
        type: string;
        page: number;
        imageId: string;
        sourceDocumentId: string;
        rect: { x0: number; y0: number; x1: number; y1: number };
      }>;
      signatureImages: Array<{
        id: string;
        mimeType: string;
        dataUrl: string;
        width: number;
        height: number;
      }>;
    };

    expect(plan.signatures).toHaveLength(1);
    expect(plan.signatures[0]).toEqual(
      expect.objectContaining({
        type: "signature",
        page: 1,
        sourceDocumentId: expect.any(String),
        rect: { x0: 75, y0: 815, x1: 255, y1: 875 },
      }),
    );
    expect(plan.signatureImages).toEqual([
      expect.objectContaining({
        id: plan.signatures[0].imageId,
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,c2lnbmF0dXJl",
        width: 900,
        height: 300,
      }),
    ]);

    getContext.mockRestore();
    toDataUrl.mockRestore();
    vi.unstubAllGlobals();
  });

  it("coordinates tools, stacking, common selection and keyboard deletion", async () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,c2lnbmF0dXJl",
    );

    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [new File(["%PDF-1.4"], "core.pdf", { type: "application/pdf" })],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    expect(screen.queryByRole("button", { name: "Sélection" })).not.toBeInTheDocument();
    expect(layer).toHaveAttribute("data-active-editing-tool", "select");

    selectInsertTool("Texte");
    expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
    fireEvent.click(layer, { clientX: 100, clientY: 150 });
    const firstText = await screen.findByLabelText("Texte ajouté page 1");
    fireEvent.change(firstText, { target: { value: "Premier objet" } });
    expect(layer).toHaveAttribute("data-active-editing-tool", "select");

    selectInsertTool("Signature");
    expect(layer).toHaveAttribute("data-active-editing-tool", "signature");
    const canvas = screen.getByLabelText("Zone de dessin de la signature");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));
    fireEvent.click(layer, { clientX: 110, clientY: 160 });
    const signature = await screen.findByAltText("Signature visuelle page 1");

    let objectClasses = Array.from(
      layer.querySelectorAll(".pdf-text-edit, .pdf-signature-edit"),
    ).map((element) => element.classList[0]);
    expect(objectClasses).toEqual(["pdf-text-edit", "pdf-signature-edit"]);
    expect(signature.closest(".pdf-signature-edit")).toHaveClass("is-selected");

    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 120, clientY: 170 });
    const textInputs = await screen.findAllByLabelText("Texte ajouté page 1");
    fireEvent.change(textInputs[1], { target: { value: "Objet au-dessus" } });
    objectClasses = Array.from(
      layer.querySelectorAll(".pdf-text-edit, .pdf-signature-edit"),
    ).map((element) => element.classList[0]);
    expect(objectClasses).toEqual([
      "pdf-text-edit",
      "pdf-signature-edit",
      "pdf-text-edit",
    ]);

    fireEvent.click(layer);
    expect(
      screen.queryByRole("region", { name: "Propriétés du texte ajouté" }),
    ).not.toBeInTheDocument();
    expect(signature.closest(".pdf-signature-edit")).not.toHaveClass("is-selected");

    fireEvent.click(signature);
    const viewer = screen.getByRole("region", { name: "Aperçu PDF core.pdf" });
    viewer.focus();
    fireEvent.keyDown(viewer, { key: "Delete" });
    expect(screen.queryByAltText("Signature visuelle page 1")).not.toBeInTheDocument();

    fireEvent.click(textInputs[1]);
    fireEvent.keyDown(textInputs[1], { key: "Backspace" });
    expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(2);
    viewer.focus();
    fireEvent.keyDown(viewer, { key: "Backspace" });
    expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(1);
  });

  it("isolates heterogeneous edits while switching between documents", async () => {
    const context = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,c2lnbmF0dXJl",
    );
    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-A"], "document-a.pdf", { type: "application/pdf" }),
          new File(["%PDF-B"], "document-b.pdf", { type: "application/pdf" }),
        ],
      },
    });
    let layer = await screen.findByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 80, clientY: 100 });
    fireEvent.change(await screen.findByLabelText("Texte ajouté page 1"), {
      target: { value: "Texte B" },
    });
    expect(
      screen.getByRole("button", { name: "document-b.pdf, document actif" }),
    ).toHaveAccessibleDescription("Modifications non sauvegardées.");
    expect(
      screen.getByRole("button", { name: "document-a.pdf" }),
    ).not.toHaveAttribute("aria-describedby");

    fireEvent.click(screen.getByRole("button", { name: "document-a.pdf" }));
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Aperçu PDF document-a.pdf" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Texte ajouté page 1")).not.toBeInTheDocument();
    layer = screen.getByLabelText("Couche d'édition de la page 1");
    selectInsertTool("Signature");
    const canvas = screen.getByLabelText("Zone de dessin de la signature");
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 20 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Valider la signature" }));
    fireEvent.click(layer, { clientX: 90, clientY: 110 });
    expect(await screen.findByAltText("Signature visuelle page 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "document-a.pdf, document actif" }),
    ).toHaveAccessibleDescription("Modifications non sauvegardées.");

    fireEvent.click(screen.getByRole("button", { name: "document-b.pdf" }));
    await screen.findByRole("region", { name: "Aperçu PDF document-b.pdf" });
    expect(screen.getByLabelText("Texte ajouté page 1")).toHaveValue("Texte B");
    expect(screen.queryByAltText("Signature visuelle page 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "document-a.pdf" }));
    await screen.findByRole("region", { name: "Aperçu PDF document-a.pdf" });
    expect(screen.getByAltText("Signature visuelle page 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Texte ajouté page 1")).not.toBeInTheDocument();
  });

  it("discards a failed restored document and releases its PDF loading task", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.reject(new Error("PDF corrompu")),
      destroy,
    } as never);
    saveViewerPreferences({
      theme: "light",
      sidebarVisible: true,
      activeDocumentId: "broken-document",
      documentOrder: ["broken-document"],
    });
    await saveStoredDocument({
      id: "broken-document",
      fileName: "broken.pdf",
      mimeType: "application/pdf",
      content: new Blob(["broken"], { type: "application/pdf" }),
      pageCount: 1,
      zoom: 1,
      scrollLeft: 0,
      scrollTop: 0,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("1 document n'a pas pu être restauré.")).toHaveLength(2);
    });
    expect(screen.getByRole("region", { name: "Aucun PDF ouvert" })).toBeInTheDocument();
    expect(destroy).toHaveBeenCalledTimes(1);
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
    expect(screen.getByLabelText("Plan d'export")).toBeInTheDocument();
    expect(screen.getByLabelText("3 pages seront exportées")).toHaveTextContent("3 pages");
    expect(screen.getByRole("button", { name: "Revenir à la lecture" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Exporter le PDF" })).toBeEnabled();
    expect(screen.getByText("Ouvrez un autre PDF pour ajouter ses pages à la fin du plan.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Tourner la page 1 vers la droite",
      }),
    );

    expect(screen.getByRole("button", { name: "Enregistrer sous…" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "organize.pdf, document actif" }),
    ).toHaveAccessibleDescription("Modifications non sauvegardées.");
  });

  it("keeps the single-document export compatible with the multi-source API", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
    let resolveExport: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      () =>
        new Promise<Response>((resolve) => {
          resolveExport = resolve;
        }),
    );
    const exportResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(new Blob(["exported"], { type: "application/pdf" })),
      headers: new Headers({
        "content-disposition": 'attachment; filename="edited.pdf"',
        "x-pdf-export-warnings": JSON.stringify([
          {
            type: "text_overflow",
            editId: "technical-id-hidden-from-feedback",
            page: 1,
            rendering: "expanded",
          },
        ]),
      }),
    } as unknown as Response;
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

    expect(screen.getByRole("button", { name: "Export en cours…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Export en cours…");
    resolveExport(exportResponse);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, request] = fetchMock.mock.calls[0] as unknown as [string, { body: FormData; method: string }];
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
    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Aperçu PDF edited.pdf" })).toBeInTheDocument();
    });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "edited.pdf, document actif" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: "Organiser" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("PDF exporté avec succès : edited.pdf");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 zone de texte dépassait de son cadre. Son export a été réalisé en mode best effort.",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent(
      "technical-id-hidden-from-feedback",
    );

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
    const externalThumbnails = screen.getByLabelText("Miniatures des pages externes");
    expect(within(externalThumbnails).getAllByLabelText(/Miniature externe de la page/)).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Ajouter beta.pdf, page 2"));
    expect(screen.getByLabelText("Ajouter beta.pdf, page 2")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" }));

    await waitFor(() => {
      expect(screen.getByText("beta.pdf — p. 2")).toBeInTheDocument();
      expect(screen.getByLabelText("Grille des pages organisées").querySelectorAll(".organize-page")).toHaveLength(3);
    });
    expect(within(screen.getByLabelText("Sources du plan d'export")).getByText("alpha.pdf : 2 pages")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Sources du plan d'export")).getByText("beta.pdf : 1 page")).toBeInTheDocument();

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
    expect(screen.getByText("Erreur du backend : Backend indisponible")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("confirms before closing a source used by an organization plan and removes its pages", async () => {
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({
      promise: Promise.resolve(createPdfDocumentMock(2)),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<App />);

    const sidebar = screen.getByRole("complementary", { name: "Documents ouverts" });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [
          new File(["%PDF-alpha"], "alpha-close.pdf", { type: "application/pdf" }),
          new File(["%PDF-beta"], "beta-close.pdf", { type: "application/pdf" }),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha-close.pdf" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "alpha-close.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter depuis un PDF ouvert" }));
    fireEvent.click(screen.getByLabelText("Ajouter beta-close.pdf, page 1"));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter les pages sélectionnées" }));

    await waitFor(() => {
      expect(screen.getByText("beta-close.pdf — p. 1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Fermer beta-close.pdf" }));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Ce document est utilisé dans le plan d'organisation. Le fermer retirera ses pages du document final.",
    );
    expect(screen.getByRole("button", { name: "beta-close.pdf" })).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Fermer beta-close.pdf" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "beta-close.pdf" })).not.toBeInTheDocument();
      expect(screen.queryByText("beta-close.pdf — p. 1")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("2 pages seront exportées")).toBeInTheDocument();

    confirmSpy.mockRestore();
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
    expect(screen.getByRole("status")).toHaveTextContent("PDF exporté avec succès : restored.pdf");

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
    expect(screen.getByText("Modifié")).toBeInTheDocument();

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

  it("groups move and resize history and supports object clipboard shortcuts", async () => {
    render(<App />);
    const sidebar = screen.getByRole("complementary", {
      name: "Documents ouverts",
    });
    fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
      target: {
        files: [new File(["%PDF-1.4"], "history.pdf", { type: "application/pdf" })],
      },
    });
    const layer = await screen.findByLabelText("Couche d'édition de la page 1");
    const undoButton = screen.getByRole("button", { name: "Annuler" });
    const redoButton = screen.getByRole("button", { name: "Rétablir" });
    expect(undoButton).toBeDisabled();
    expect(redoButton).toBeDisabled();

    selectInsertTool("Texte");
    fireEvent.click(layer, { clientX: 100, clientY: 150 });
    const input = await screen.findByLabelText("Texte ajouté page 1");
    fireEvent.change(input, {
      target: { value: "Un texte suffisamment long pour revenir à la ligne" },
    });
    fireEvent.blur(input);
    const block = input.closest<HTMLElement>(".pdf-text-edit");
    expect(block).not.toBeNull();
    expect(undoButton).toBeEnabled();

    fireEvent.click(undoButton);
    expect(input).toHaveValue("");
    fireEvent.click(redoButton);
    expect(input).toHaveValue(
      "Un texte suffisamment long pour revenir à la ligne",
    );

    const moveHandle = screen.getByRole("button", {
      name: "Déplacer le bloc de texte page 1",
    });
    fireEvent.mouseDown(moveHandle, { button: 0, clientX: 100, clientY: 150 });
    fireEvent.mouseMove(window, { clientX: 110, clientY: 155 });
    fireEvent.mouseMove(window, { clientX: 125, clientY: 162 });
    fireEvent.mouseMove(window, { clientX: 140, clientY: 170 });
    fireEvent.mouseUp(window);
    expect(block).toHaveStyle({ left: "140px", top: "170px" });

    fireEvent.click(undoButton);
    expect(block).toHaveStyle({ left: "100px", top: "150px" });
    expect(redoButton).toBeEnabled();
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(block).toHaveStyle({ left: "140px", top: "170px" });

    const resizeHandle = screen.getByRole("button", {
      name: "Redimensionner le bloc de texte depuis se",
    });
    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 360, clientY: 242 });
    fireEvent.mouseMove(window, { clientX: 220, clientY: 190 });
    fireEvent.mouseMove(window, { clientX: 120, clientY: 160 });
    fireEvent.mouseUp(window);
    expect(block).toHaveStyle({ width: "8px", height: "18px" });
    expect(input).toHaveStyle({ fontSize: "18px" });
    expect(input).toHaveValue(
      "Un texte suffisamment long pour revenir à la ligne",
    );

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(block).toHaveStyle({ width: "220px", height: "72px" });
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(block).toHaveStyle({ width: "8px", height: "18px" });

    fireEvent.click(block as HTMLElement);
    expect(fireEvent.keyDown(window, { key: "c", ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: "v", ctrlKey: true })).toBe(false);
    await waitFor(() => {
      expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(2);
    });
    const copiedInputs = screen.getAllByLabelText("Texte ajouté page 1");
    const copyBlock = copiedInputs[1].closest<HTMLElement>(".pdf-text-edit");
    expect(copiedInputs[1]).toHaveValue(
      "Un texte suffisamment long pour revenir à la ligne",
    );
    expect(copyBlock).toHaveStyle({
      left: "152px",
      top: "182px",
      width: "8px",
      height: "18px",
    });
    expect(copiedInputs[1]).toHaveStyle({ fontSize: "18px" });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(1);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(2);

    const nativeInput = screen.getAllByLabelText("Texte ajouté page 1")[1];
    nativeInput.focus();
    expect(fireEvent.keyDown(nativeInput, { key: "c", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(nativeInput, { key: "v", ctrlKey: true })).toBe(true);
    expect(screen.getAllByLabelText("Texte ajouté page 1")).toHaveLength(2);
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

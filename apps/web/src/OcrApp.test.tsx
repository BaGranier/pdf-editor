import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import * as pdfjsLib from "pdfjs-dist";
import { App } from "./App";
import {
  clearViewerStorage,
  loadStoredDocument,
  loadViewerPreferences,
} from "./storage/viewerStorage";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  AnnotationMode: { ENABLE: 1, ENABLE_FORMS: 2 },
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
    getViewport: vi.fn(() => ({
      width: 800,
      height: 1000,
      scale: 1,
      userUnit: 1,
      rotation: 0,
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

async function openPdf(fileName = "source.pdf", pageCount = 1) {
  vi.mocked(pdfjsLib.getDocument).mockReturnValue({
    promise: Promise.resolve(createPdfDocumentMock(pageCount)),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as never);

  const sidebar = screen.getByRole("complementary", {
    name: "Documents ouverts",
  });
  fireEvent.change(within(sidebar).getByLabelText("Ouvrir un PDF"), {
    target: {
      files: [
        new File(["%PDF-1.4\nsource"], fileName, {
          type: "application/pdf",
        }),
      ],
    },
  });

  await waitFor(() => {
    expect(
      screen.getByRole("button", {
        name: `${fileName}, document actif`,
      }),
    ).toBeInTheDocument();
  });
}

function openOcrDialog() {
  fireEvent.click(screen.getByRole("button", { name: "OCR" }));
  return screen.getByRole("dialog", {
    name: "Reconnaissance de texte (OCR)",
  });
}

function launchOcr() {
  fireEvent.click(screen.getByRole("button", { name: "Lancer l’OCR" }));
}

describe("OCR in App", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearViewerStorage();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a protected PDF closed on cancel and wrong password, then persists only working bytes", async () => {
    render(<App />);
    const protectedFile = new File(["%PDF-locked"], "protected.pdf", { type: "application/pdf" });
    const input = within(screen.getByRole("complementary", { name: "Documents ouverts" })).getByLabelText("Ouvrir un PDF");
    const rejectTask = () => ({
      promise: Promise.reject(Object.assign(new Error("Password required"), { name: "PasswordException" })),
      destroy: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(pdfjsLib.getDocument).mockImplementation(rejectTask as never);
    fireEvent.change(input, { target: { files: [protectedFile] } });
    const cancelled = await screen.findByRole("dialog", { name: "PDF protégé" });
    fireEvent.click(within(cancelled).getByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "PDF protégé" })).not.toBeInTheDocument());
    expect(loadViewerPreferences()?.documentOrder ?? []).toEqual([]);
    const fetchMock = vi.fn().mockResolvedValueOnce(createResponse({ ok: false, json: async () => ({ code: "PDF_PASSWORD_INVALID" }) })).mockResolvedValueOnce(createResponse());
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.change(input, { target: { files: [protectedFile] } });
    let dialog = await screen.findByRole("dialog", { name: "PDF protégé" });
    fireEvent.change(within(dialog).getByLabelText("Mot de passe"), { target: { value: "synthetic-wrong" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ouvrir" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "protected.pdf, document actif" })).not.toBeInTheDocument();
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({ promise: Promise.resolve(createPdfDocumentMock()), destroy: vi.fn().mockResolvedValue(undefined) } as never);
    dialog = screen.getByRole("dialog", { name: "PDF protégé" });
    fireEvent.change(within(dialog).getByLabelText("Mot de passe"), { target: { value: "synthetic-open" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Ouvrir" }));
    const opened = await screen.findByRole("button", { name: "protected.pdf, document actif" });
    expect(opened).not.toHaveAttribute("aria-describedby");
    await waitFor(() => expect(loadViewerPreferences()?.documentOrder).toHaveLength(1));
    let stored: Awaited<ReturnType<typeof loadStoredDocument>> = null;
    await waitFor(async () => {
      stored = await loadStoredDocument(loadViewerPreferences()!.documentOrder[0]);
      expect(stored).not.toBeNull();
    });
    expect(JSON.stringify(stored)).not.toContain("synthetic-open");
    expect(await stored!.content.text()).not.toContain("synthetic-open");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("transports explicit scan rotation without changing existing OCR defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(createResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await openPdf();
    const dialog = openOcrDialog();
    fireEvent.change(within(dialog).getByLabelText("Correction de rotation des scans"), { target: { value: "270" } });
    launchOcr();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("rotation")).toBe("270");
    expect(form.get("mode")).toBe("force-ocr");
    expect(form.get("deskew")).toBe("true");
  });

  it("shows a disabled OCR button until a PDF is active", async () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "OCR" })).toBeDisabled();
    await openPdf();
    expect(screen.getByRole("button", { name: "OCR" })).toBeEnabled();
  });

  it("opens the simplified OCR form with defaults and cancels without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await openPdf();

    const dialog = openOcrDialog();
    expect(
      within(dialog).getByRole("combobox", { name: "Langue du document" }),
    ).toHaveValue("fra");
    expect(within(dialog).getByRole("option", { name: "Anglais" })).toHaveValue(
      "eng",
    );
    expect(
      within(dialog).getByRole("option", { name: "Français et anglais" }),
    ).toHaveValue("fra+eng");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Mode OCR")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText(
        /Ignorer les pages qui contiennent déjà du texte/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Forcer l’OCR sur toutes les pages"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "L’OCR sera appliqué à toutes les pages du document.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "Le traitement de toutes les pages peut prendre plusieurs minutes.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("checkbox", {
        name: "Redresser automatiquement les pages inclinées",
      }),
    ).toBeChecked();

    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends selected options, exposes processing state, and prevents a second launch", async () => {
    let resolveOcr: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveOcr = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await openPdf();

    const dialog = openOcrDialog();
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Langue du document" }),
      { target: { value: "fra+eng" } },
    );
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Redresser automatiquement les pages inclinées",
      }),
    );
    launchOcr();

    expect(screen.getByRole("status")).toHaveTextContent("OCR en cours…");
    const ocrButton = screen.getByRole("button", { name: "OCR" });
    expect(ocrButton).toBeDisabled();
    fireEvent.click(ocrButton);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, request] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const body = request.body as FormData;
    expect(url).toBe("http://localhost:8000/ocr");
    expect(request.method).toBe("POST");
    expect(request.headers).toBeUndefined();
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toMatchObject({ name: "source.pdf" });
    expect(body.get("languages")).toBe("fra+eng");
    expect(body.get("mode")).toBe("force-ocr");
    expect(body.get("deskew")).toBe("false");

    resolveOcr(
      createResponse({
        headers: new Headers({
          "content-disposition": 'attachment; filename="source_OCR.pdf"',
        }),
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "OCR" })).toBeEnabled();
      expect(screen.queryByText("OCR en cours…")).not.toBeInTheDocument();
    });
  });

  it("opens and persists the OCR PDF while keeping the source document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse({
        headers: new Headers({
          "content-disposition":
            "attachment; filename*=UTF-8''r%C3%A9sultat_OCR.pdf",
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await openPdf("scan.pdf", 2);

    openOcrDialog();
    launchOcr();

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "résultat_OCR.pdf, document actif",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "scan.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "OCR terminé. Le document OCR a été ouvert.",
    );

    await waitFor(
      async () => {
        const activeDocumentId = loadViewerPreferences()?.activeDocumentId;
        expect(activeDocumentId).not.toBeNull();
        const storedDocument = await loadStoredDocument(activeDocumentId ?? "");
        expect(storedDocument?.fileName).toBe("résultat_OCR.pdf");
        expect(storedDocument?.mimeType).toBe("application/pdf");
      },
      { timeout: 1200 },
    );

    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    expect(screen.getByText("Ordre d'origine")).toBeInTheDocument();
  });

  it("warns that pending organization changes are not included", async () => {
    render(<App />);
    await openPdf("organized-source.pdf", 2);
    fireEvent.click(screen.getByRole("button", { name: "Organiser" }));
    fireEvent.click(
      within(screen.getByLabelText("Page 1")).getByRole("button", {
        name: "Tourner la page 1 vers la droite",
      }),
    );

    const dialog = openOcrDialog();
    expect(within(dialog).getByRole("note")).toHaveTextContent(
      "L’OCR sera appliqué au PDF source. Les modifications d’organisation non exportées ne seront pas incluses.",
    );
  });

  it.each([
    {
      name: "root error",
      response: createResponse({
        ok: false,
        json: vi.fn().mockResolvedValue({
          code: "OCR_FAILED",
          message: "Échec OCR du backend.",
        }),
      }),
      expected: "Échec OCR du backend.",
    },
    {
      name: "detail error",
      response: createResponse({
        ok: false,
        json: vi.fn().mockResolvedValue({
          detail: {
            code: "OCR_TIMEOUT",
            message: "Délai OCR du backend dépassé.",
          },
        }),
      }),
      expected: "Délai OCR du backend dépassé.",
    },
    {
      name: "non-JSON error",
      response: createResponse({
        ok: false,
        json: vi.fn().mockRejectedValue(new SyntaxError("not json")),
      }),
      expected: "Le traitement OCR a échoué.",
    },
    {
      name: "invalid successful response",
      response: createResponse({
        blob: new Blob(["not a PDF"], { type: "application/pdf" }),
      }),
      expected: "Le serveur n'a pas produit un PDF valide.",
    },
  ])("keeps the source active after $name", async ({ response, expected }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    render(<App />);
    await openPdf();

    openOcrDialog();
    launchOcr();

    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "OCR" })).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "source.pdf, document actif",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Documents ouverts" })
        .querySelectorAll(".document-tab"),
    ).toHaveLength(1);
  });

  it("shows a clear network error and restores the interface", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    render(<App />);
    await openPdf();

    openOcrDialog();
    launchOcr();

    await waitFor(() => {
      expect(
        screen.getByText("Impossible de contacter le moteur PDF."),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "OCR" })).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "source.pdf, document actif",
      }),
    ).toBeInTheDocument();
  });
});

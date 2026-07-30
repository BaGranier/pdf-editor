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
import { clearViewerStorage } from "./storage/viewerStorage";

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

function createPdfDocumentMock(pageCount = 2) {
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

async function openPdf() {
  vi.mocked(pdfjsLib.getDocument).mockReturnValue({
    promise: Promise.resolve(createPdfDocumentMock()),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as never);
  fireEvent.change(screen.getByLabelText("Ouvrir un PDF"), {
    target: {
      files: [
        new File(["%PDF-1.7\nsource"], "source.pdf", {
          type: "application/pdf",
        }),
      ],
    },
  });
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "source.pdf, document actif" }),
    ).toBeInTheDocument();
  });
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Convertir" }));
  return screen.getByRole("dialog", { name: "Convertir le PDF" });
}

function createResponse({
  ok = true,
  contentType = (
    "application/vnd.openxmlformats-officedocument."
    + "wordprocessingml.document"
  ),
  body = "PK\u0003\u0004docx",
  headers = {},
  payload,
}: {
  ok?: boolean;
  contentType?: string;
  body?: string;
  headers?: Record<string, string>;
  payload?: object;
} = {}) {
  const responseHeaders = new Headers({
    "content-type": contentType,
    ...headers,
  });
  return {
    ok,
    headers: responseHeaders,
    blob: vi.fn().mockResolvedValue(new Blob([body], { type: contentType })),
    json: vi.fn().mockResolvedValue(payload ?? {}),
  } as unknown as Response;
}

describe("PDF conversion in App", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearViewerStorage();
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:conversion"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("disables conversion until a PDF is active", async () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Convertir" })).toBeDisabled();
    await openPdf();
    expect(screen.getByRole("button", { name: "Convertir" })).toBeEnabled();
  });

  it("shows format-specific options and the DOCX fidelity warning", async () => {
    render(<App />);
    await openPdf();
    const dialog = openDialog();

    expect(within(dialog).getByLabelText("Format de sortie")).toHaveValue("docx");
    expect(within(dialog).getByLabelText("Langue OCR")).toHaveValue("fra");
    expect(within(dialog).getByLabelText("Reconnaissance OCR")).toHaveValue("auto");
    expect(within(dialog).getByLabelText("Mode Word")).toHaveValue("editable");
    expect(within(dialog).getByLabelText("Nom du fichier")).toHaveValue(
      "source.docx",
    );
    expect(within(dialog).getByText(/éléments complexes/)).toBeVisible();
    expect(
      within(dialog).getByText(/Produit un document modifiable/),
    ).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText("Mode Word"), {
      target: { value: "visual" },
    });
    expect(
      within(dialog).getByText(/Conserve l’apparence sous forme d’images/),
    ).toBeVisible();
    expect(
      within(dialog).getByText(/Chaque page sera conservée comme une image/),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Nom du fichier")).toHaveValue(
      "source-visual.docx",
    );

    fireEvent.change(within(dialog).getByLabelText("Format de sortie"), {
      target: { value: "png" },
    });
    expect(within(dialog).queryByLabelText("Mode Word")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Langue OCR")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Résolution")).toHaveValue("150");
    expect(within(dialog).getByLabelText("Nom du fichier")).toHaveValue(
      "source-images.zip",
    );
    expect(within(dialog).queryByLabelText(/Qualité JPEG/)).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Format de sortie"), {
      target: { value: "jpeg" },
    });
    expect(within(dialog).getByLabelText(/Qualité JPEG/)).toBeInTheDocument();
  });

  it("preserves a custom base, updates extensions and rejects invalid names", async () => {
    render(<App />);
    await openPdf();
    const dialog = openDialog();
    const filename = within(dialog).getByLabelText("Nom du fichier");
    const submit = within(dialog).getByRole("button", {
      name: "Lancer la conversion",
    });

    fireEvent.change(filename, { target: { value: "mon compte-rendu.docx" } });
    fireEvent.change(within(dialog).getByLabelText("Format de sortie"), {
      target: { value: "txt" },
    });
    expect(filename).toHaveValue("mon compte-rendu.txt");

    fireEvent.change(within(dialog).getByLabelText("Format de sortie"), {
      target: { value: "png" },
    });
    expect(filename).toHaveValue("mon compte-rendu.zip");
    fireEvent.change(within(dialog).getByLabelText("Pages"), {
      target: { value: "2" },
    });
    expect(filename).toHaveValue("mon compte-rendu.png");

    fireEvent.change(filename, { target: { value: "" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Le nom du fichier est requis.",
    );
    expect(submit).toBeDisabled();

    fireEvent.change(filename, { target: { value: "../secret.png" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Le nom ne peut pas contenir",
    );
    expect(submit).toBeDisabled();
  });

  it("downloads a real response, exposes progress and keeps the source open", async () => {
    let resolveRequest: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    await openPdf();
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText("Langue OCR"), {
      target: { value: "fra+eng" },
    });
    fireEvent.change(within(dialog).getByLabelText("Reconnaissance OCR"), {
      target: { value: "always" },
    });
    fireEvent.change(within(dialog).getByLabelText("Pages"), {
      target: { value: "1-2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Nom du fichier"), {
      target: { value: "dossier final" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Lancer la conversion" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("Conversion en cours…");
    expect(screen.getByRole("button", { name: "Convertir" })).toBeDisabled();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    const request = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe("http://localhost:8000/convert");
    const form = request[1].body as FormData;
    expect(form.get("target_format")).toBe("docx");
    expect(form.get("languages")).toBe("fra+eng");
    expect(form.get("ocr_mode")).toBe("always");
    expect(form.get("pages")).toBe("1-2");
    expect(form.get("docx_mode")).toBe("editable");
    expect(form.get("output_filename")).toBe("dossier final.docx");

    resolveRequest(
      createResponse({
        headers: {
          "content-disposition": 'attachment; filename="dossier final.docx"',
          "x-conversion-pages": "1,2",
          "x-conversion-ocr-used": "true",
          "x-conversion-output-bytes": "42",
          "x-conversion-warnings": encodeURIComponent(
            JSON.stringify([
              "La conversion Word éditable est dégradée : moins de 50 % du texte source a été reconstruit.",
            ]),
          ),
        },
      }),
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Conversion réussie : dossier final.docx (2 pages). OCR automatique utilisé.",
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Avertissement : La conversion Word éditable est dégradée",
    );
    expect(
      screen.getByRole("button", { name: "source.pdf, document actif" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dossier final\.docx, document actif/ }))
      .not.toBeInTheDocument();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("shows stable backend conversion errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        createResponse({
          ok: false,
          contentType: "application/json",
          payload: {
            code: "INVALID_PAGE_RANGE",
            message: "Plage invalide côté serveur.",
          },
        }),
      ),
    );
    render(<App />);
    await openPdf();
    const dialog = openDialog();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Lancer la conversion" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Plage invalide côté serveur.",
      );
    });
    expect(
      screen.getByRole("button", { name: "source.pdf, document actif" }),
    ).toBeInTheDocument();
  });
});

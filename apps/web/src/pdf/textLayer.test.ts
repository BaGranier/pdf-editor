import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import { renderPdfTextLayer } from "./textLayer";

const textLayerMock = vi.hoisted(() => ({
  instances: [] as Array<{
    options: {
      textContentSource: ReadableStream;
      container: HTMLDivElement;
      viewport: PageViewport;
    };
    cancel: ReturnType<typeof vi.fn>;
  }>,
  items: ["Texte sélectionnable"],
  renderError: null as Error | null,
  renderPromise: null as Promise<void> | null,
}));

vi.mock("pdfjs-dist", () => ({
  TextLayer: class TextLayerMock {
    textContentItemsStr = [...textLayerMock.items];
    options: {
      textContentSource: ReadableStream;
      container: HTMLDivElement;
      viewport: PageViewport;
    };
    cancel = vi.fn();

    constructor(options: {
      textContentSource: ReadableStream;
      container: HTMLDivElement;
      viewport: PageViewport;
    }) {
      this.options = options;
      textLayerMock.instances.push(this);
    }

    async render() {
      if (textLayerMock.renderPromise) {
        await textLayerMock.renderPromise;
      }
      if (textLayerMock.renderError) {
        throw textLayerMock.renderError;
      }

      for (const item of this.textContentItemsStr) {
        const span = document.createElement("span");
        span.textContent = item;
        this.options.container.append(span);
      }
    }
  },
}));

const createViewport = (rotation = 0) =>
  ({
    width: rotation % 180 === 0 ? 600 : 800,
    height: rotation % 180 === 0 ? 800 : 600,
    scale: 1.5,
    userUnit: 1,
    rotation,
  }) as PageViewport;

const createPage = () => {
  const stream = new ReadableStream();
  const streamTextContent = vi.fn(() => stream);

  return {
    page: { streamTextContent } as unknown as PDFPageProxy,
    stream,
    streamTextContent,
  };
};

describe("renderPdfTextLayer", () => {
  beforeEach(() => {
    textLayerMock.instances.length = 0;
    textLayerMock.items = ["Texte sélectionnable"];
    textLayerMock.renderError = null;
    textLayerMock.renderPromise = null;
  });

  it("uses the supplied viewport and PDF.js text stream", async () => {
    const { page, stream, streamTextContent } = createPage();
    const viewport = createViewport(90);
    const container = document.createElement("div");

    const task = renderPdfTextLayer({ page, viewport, container });

    await expect(task.promise).resolves.toBe(true);
    expect(streamTextContent).toHaveBeenCalledWith({
      includeMarkedContent: true,
    });
    expect(textLayerMock.instances[0]?.options).toMatchObject({
      textContentSource: stream,
      viewport,
    });
    expect(textLayerMock.instances[0]?.options.container).not.toBe(container);
    expect(container).toHaveTextContent("Texte sélectionnable");
    expect(container).not.toHaveAttribute("hidden");
    expect(container.style.width).toBe("800px");
    expect(container.style.height).toBe("600px");
    expect(container.style.getPropertyValue("--total-scale-factor")).toBe(
      "1.5",
    );
  });

  it.each([0, 90, 180, 270])(
    "passes the canvas rotation %i° through unchanged",
    async (rotation) => {
      const { page } = createPage();
      const viewport = createViewport(rotation);
      const container = document.createElement("div");

      const task = renderPdfTextLayer({ page, viewport, container });
      await task.promise;

      expect(textLayerMock.instances[0]?.options.viewport).toBe(viewport);
      expect(
        textLayerMock.instances[0]?.options.viewport.rotation,
      ).toBe(rotation);
    },
  );

  it("removes and hides an empty text layer", async () => {
    textLayerMock.items = ["", "   "];
    const { page } = createPage();
    const container = document.createElement("div");

    const task = renderPdfTextLayer({
      page,
      viewport: createViewport(),
      container,
    });

    await expect(task.promise).resolves.toBe(false);
    expect(container).toBeEmptyDOMElement();
    expect(container).toHaveAttribute("hidden");
  });

  it("cancels an unfinished PDF.js render and blocks its late DOM result", async () => {
    let finishRender: () => void = () => undefined;
    textLayerMock.renderPromise = new Promise<void>((resolve) => {
      finishRender = resolve;
    });
    const { page } = createPage();
    const container = document.createElement("div");
    const task = renderPdfTextLayer({
      page,
      viewport: createViewport(),
      container,
    });
    const instance = textLayerMock.instances[0];

    task.cancel();
    finishRender();

    await expect(task.promise).resolves.toBe(false);
    expect(instance?.cancel).toHaveBeenCalledOnce();
    expect(container).toBeEmptyDOMElement();
    expect(container).toHaveAttribute("hidden");
  });

  it("does not let an obsolete render overwrite a newer layer in the same container", async () => {
    let finishFirstRender: () => void = () => undefined;
    textLayerMock.renderPromise = new Promise<void>((resolve) => {
      finishFirstRender = resolve;
    });
    textLayerMock.items = ["Ancien zoom"];
    const { page } = createPage();
    const container = document.createElement("div");
    const firstTask = renderPdfTextLayer({
      page,
      viewport: createViewport(),
      container,
    });

    textLayerMock.renderPromise = null;
    textLayerMock.items = ["Nouveau zoom"];
    const secondTask = renderPdfTextLayer({
      page,
      viewport: createViewport(90),
      container,
    });
    await expect(secondTask.promise).resolves.toBe(true);

    firstTask.cancel();
    finishFirstRender();
    await expect(firstTask.promise).resolves.toBe(false);

    expect(container).toHaveTextContent("Nouveau zoom");
    expect(container).not.toHaveTextContent("Ancien zoom");
    expect(container).not.toHaveAttribute("hidden");
  });

  it("keeps the layer hidden when PDF.js rendering fails", async () => {
    textLayerMock.renderError = new Error("text layer failure");
    const { page } = createPage();
    const container = document.createElement("div");
    const task = renderPdfTextLayer({
      page,
      viewport: createViewport(),
      container,
    });

    await expect(task.promise).rejects.toThrow("text layer failure");
    expect(container).toBeEmptyDOMElement();
    expect(container).toHaveAttribute("hidden");
  });
});

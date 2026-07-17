import {
  TextLayer,
  type PDFPageProxy,
  type PageViewport,
} from "pdfjs-dist";

type RenderPdfTextLayerOptions = {
  page: PDFPageProxy;
  viewport: PageViewport;
  container: HTMLDivElement;
};

export type PdfTextLayerRenderTask = {
  promise: Promise<boolean>;
  cancel: () => void;
};

const textLayerOwners = new WeakMap<HTMLDivElement, object>();

const clearTextLayer = (container: HTMLDivElement) => {
  container.replaceChildren();
  container.hidden = true;
};

export const renderPdfTextLayer = ({
  page,
  viewport,
  container,
}: RenderPdfTextLayerOptions): PdfTextLayerRenderTask => {
  const owner = {};
  const stagingContainer = document.createElement("div");

  textLayerOwners.set(container, owner);
  clearTextLayer(container);

  const textLayer = new TextLayer({
    textContentSource: page.streamTextContent({
      includeMarkedContent: true,
    }),
    container: stagingContainer,
    viewport,
  });

  // PDF.js positions glyphs in CSS pixels. Keep these dimensions tied to the
  // viewport rather than to the high-resolution bitmap dimensions of the canvas.
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;
  container.style.setProperty(
    "--total-scale-factor",
    String(viewport.scale * viewport.userUnit),
  );
  const mainRotation = stagingContainer.dataset.mainRotation;
  if (mainRotation) {
    container.dataset.mainRotation = mainRotation;
  } else {
    delete container.dataset.mainRotation;
  }

  let cancelled = false;
  let settled = false;

  const promise = textLayer
    .render()
    .then(() => {
      if (cancelled || textLayerOwners.get(container) !== owner) {
        return false;
      }

      const hasText = textLayer.textContentItemsStr.some(
        (item) => item.trim().length > 0,
      );

      if (!hasText) {
        clearTextLayer(container);
      } else {
        container.replaceChildren(...stagingContainer.childNodes);
        container.hidden = false;
      }

      return hasText;
    })
    .catch((error: unknown) => {
      if (textLayerOwners.get(container) === owner) {
        clearTextLayer(container);
      }

      if (
        cancelled ||
        (error instanceof Error && error.name === "AbortException")
      ) {
        return false;
      }

      throw error;
    })
    .finally(() => {
      settled = true;
    });

  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (!settled) {
        textLayer.cancel();
      }
      if (textLayerOwners.get(container) === owner) {
        textLayerOwners.delete(container);
        clearTextLayer(container);
      }
    },
  };
};

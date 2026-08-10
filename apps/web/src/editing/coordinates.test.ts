import { describe, expect, it } from "vitest";
import {
  createPdfRectAtScreenPoint,
  pdfRectToViewportStyle,
  resizePdfRectByScreenDelta,
  screenPointToPdf,
  translatePdfRectByScreenDelta,
  type PdfViewport,
} from "./coordinates";

function createViewport(rotation: 0 | 90 | 180 | 270): PdfViewport {
  if (rotation === 0) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [2, 0, 0, -2, 0, 1600],
      convertToPdfPoint: (x, y) => [x / 2, 800 - y / 2],
      convertToViewportPoint: (x, y) => [x * 2, 1600 - y * 2],
    } as PdfViewport;
  }

  if (rotation === 180) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [-2, 0, 0, 2, 1200, 0],
      convertToPdfPoint: (x, y) => [600 - x / 2, y / 2],
      convertToViewportPoint: (x, y) => [(600 - x) * 2, y * 2],
    } as PdfViewport;
  }

  if (rotation === 270) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [0, -2, -2, 0, 1600, 1200],
      convertToPdfPoint: (x, y) => [600 - y / 2, 800 - x / 2],
      convertToViewportPoint: (x, y) => [(800 - y) * 2, (600 - x) * 2],
    } as PdfViewport;
  }

  return {
    viewBox: [0, 0, 600, 800],
    transform: [0, 2, 2, 0, 0, 0],
    convertToPdfPoint: (x, y) => [y / 2, x / 2],
    convertToViewportPoint: (x, y) => [y * 2, x * 2],
  } as PdfViewport;
}

describe("PDF edit coordinate conversions", () => {
  it("stores a click in native PDF coordinates independently of zoom", () => {
    const viewport = createViewport(0);

    expect(screenPointToPdf(viewport, { x: 200, y: 300 })).toEqual({
      x: 100,
      y: 650,
    });
    expect(createPdfRectAtScreenPoint(viewport, { x: 200, y: 300 })).toEqual({
      x0: 100,
      y0: 578,
      x1: 320,
      y1: 650,
    });
  });

  it("projects a native rectangle through zoom and page rotation", () => {
    expect(
      pdfRectToViewportStyle(createViewport(0), {
        x0: 100,
        y0: 578,
        x1: 320,
        y1: 650,
      }),
    ).toEqual({
      left: 200,
      top: 300,
      width: 440,
      height: 144,
      transform: "matrix(1, 0, 0, 1, 0, 0)",
    });
    expect(
      pdfRectToViewportStyle(createViewport(90), {
        x0: 100,
        y0: 578,
        x1: 320,
        y1: 650,
      }),
    ).toEqual({
      left: 1300,
      top: 200,
      width: 440,
      height: 144,
      transform: "matrix(0, 1, -1, 0, 0, 0)",
    });
  });

  it("moves and clamps a rectangle using screen deltas on rotated pages", () => {
    const moved = translatePdfRectByScreenDelta(
      createViewport(90),
      { x0: 100, y0: 578, x1: 320, y1: 650 },
      { x: 40, y: 20 },
    );

    expect(moved).toEqual({ x0: 110, y0: 598, x1: 330, y1: 670 });
  });

  it.each([0, 90, 180, 270] as const)(
    "round-trips native coordinates at %i degrees",
    (rotation) => {
      const viewport = createViewport(rotation);
      const pdfPoint = { x: 175, y: 625 };
      const [screenX, screenY] = viewport.convertToViewportPoint(
        pdfPoint.x,
        pdfPoint.y,
      );

      expect(screenPointToPdf(viewport, { x: screenX, y: screenY })).toEqual(
        pdfPoint,
      );
    },
  );

  it("resizes proportionally in native coordinates, including after rotation", () => {
    const original = { x0: 100, y0: 500, x1: 300, y1: 600 };

    expect(
      resizePdfRectByScreenDelta(
        createViewport(0),
        original,
        { x: 100, y: 20 },
        2,
      ),
    ).toEqual({ x0: 100, y0: 475, x1: 350, y1: 600 });
    expect(
      resizePdfRectByScreenDelta(
        createViewport(90),
        original,
        { x: -40, y: 80 },
        2,
      ),
    ).toEqual({ x0: 100, y0: 480, x1: 340, y1: 600 });
  });
});

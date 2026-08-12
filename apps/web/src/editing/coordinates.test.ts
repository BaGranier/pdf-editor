import { describe, expect, it } from "vitest";
import {
  createPdfRectAtScreenPoint,
  getMinimumTextRectSize,
  offsetPdfRectWithinPage,
  pdfRectToViewportStyle,
  resizeFreeformPdfRectByScreenDelta,
  resizePdfRectByScreenDelta,
  screenPointToPdf,
  translatePdfRectByScreenDelta,
  type PdfViewport,
} from "./coordinates";

function createViewport(
  rotation: 0 | 90 | 180 | 270,
  scale = 2,
): PdfViewport {
  if (rotation === 0) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [scale, 0, 0, -scale, 0, 800 * scale],
      convertToPdfPoint: (x, y) => [x / scale, 800 - y / scale],
      convertToViewportPoint: (x, y) => [x * scale, (800 - y) * scale],
    } as PdfViewport;
  }

  if (rotation === 180) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [-scale, 0, 0, scale, 600 * scale, 0],
      convertToPdfPoint: (x, y) => [600 - x / scale, y / scale],
      convertToViewportPoint: (x, y) => [(600 - x) * scale, y * scale],
    } as PdfViewport;
  }

  if (rotation === 270) {
    return {
      viewBox: [0, 0, 600, 800],
      transform: [0, -scale, -scale, 0, 800 * scale, 600 * scale],
      convertToPdfPoint: (x, y) => [600 - y / scale, 800 - x / scale],
      convertToViewportPoint: (x, y) => [(800 - y) * scale, (600 - x) * scale],
    } as PdfViewport;
  }

  return {
    viewBox: [0, 0, 600, 800],
    transform: [0, scale, scale, 0, 0, 0],
    convertToPdfPoint: (x, y) => [y / scale, x / scale],
    convertToViewportPoint: (x, y) => [y * scale, x * scale],
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

  it.each([0, 90, 180, 270] as const)(
    "resizes a text rectangle freely in native coordinates at %i degrees",
    (rotation) => {
      const viewport = createViewport(rotation);
      const original = { x0: 100, y0: 500, x1: 300, y1: 600 };
      const [screenX0, screenY0] = viewport.convertToViewportPoint(0, 0);
      const [screenX1, screenY1] = viewport.convertToViewportPoint(30, -20);

      expect(
        resizeFreeformPdfRectByScreenDelta(
          viewport,
          original,
          { x: screenX1 - screenX0, y: screenY1 - screenY0 },
          "se",
        ),
      ).toEqual({ x0: 100, y0: 480, x1: 330, y1: 600 });
    },
  );

  it("enforces a small non-zero absolute minimum", () => {
    expect(
      resizeFreeformPdfRectByScreenDelta(
        createViewport(0),
        { x0: 100, y0: 500, x1: 300, y1: 600 },
        { x: -2_000, y: -2_000 },
        "se",
      ),
    ).toEqual({ x0: 100, y0: 591, x1: 108, y1: 600 });
  });

  it("uses one font em for text height while keeping a small safety floor", () => {
    expect(getMinimumTextRectSize(6)).toEqual({ width: 8, height: 9 });
    expect(getMinimumTextRectSize(18)).toEqual({ width: 8, height: 18 });
    expect(getMinimumTextRectSize(36)).toEqual({ width: 8, height: 36 });
  });

  it.each([0.5, 1, 2])(
    "keeps text resize geometry stable at %d× zoom",
    (scale) => {
      const viewport = createViewport(90, scale);
      const original = { x0: 100, y0: 500, x1: 300, y1: 600 };
      const [screenX0, screenY0] = viewport.convertToViewportPoint(0, 0);
      const [screenX1, screenY1] = viewport.convertToViewportPoint(50, -25);

      expect(
        resizeFreeformPdfRectByScreenDelta(
          viewport,
          original,
          { x: screenX1 - screenX0, y: screenY1 - screenY0 },
          "se",
        ),
      ).toEqual({ x0: 100, y0: 475, x1: 350, y1: 600 });
    },
  );

  it.each([0.5, 1, 2])(
    "keeps the canonical minimum at %d× zoom",
    (scale) => {
      const minimum = getMinimumTextRectSize(18);
      expect(
        resizeFreeformPdfRectByScreenDelta(
          createViewport(0, scale),
          { x0: 100, y0: 500, x1: 300, y1: 600 },
          { x: -1_000 * scale, y: -1_000 * scale },
          "se",
          minimum.width,
          minimum.height,
        ),
      ).toEqual({ x0: 100, y0: 582, x1: 108, y1: 600 });
    },
  );

  it.each([0, 90, 180, 270] as const)(
    "keeps a minimum-size rectangle inside page edges at %i degrees",
    (rotation) => {
      const viewport = createViewport(rotation);
      const minimum = getMinimumTextRectSize(18);
      const [screenX0, screenY0] = viewport.convertToViewportPoint(0, 0);
      const [screenX1, screenY1] = viewport.convertToViewportPoint(-500, 500);
      const resized = resizeFreeformPdfRectByScreenDelta(
        viewport,
        { x0: 0, y0: 700, x1: 40, y1: 800 },
        { x: screenX1 - screenX0, y: screenY1 - screenY0 },
        "nw",
        minimum.width,
        minimum.height,
      );

      expect(resized.x0).toBeGreaterThanOrEqual(0);
      expect(resized.y1).toBeLessThanOrEqual(800);
      expect(resized.x1 - resized.x0).toBeGreaterThanOrEqual(minimum.width);
      expect(resized.y1 - resized.y0).toBeGreaterThanOrEqual(minimum.height);
    },
  );

  it("offsets pasted rectangles in PDF coordinates and keeps them visible", () => {
    expect(
      offsetPdfRectWithinPage(
        { x0: 570, y0: 5, x1: 620, y1: 35 },
        [0, 0, 600, 800],
        { x: 12, y: 12 },
      ),
    ).toEqual({ x0: 550, y0: 0, x1: 600, y1: 30 });
  });
});

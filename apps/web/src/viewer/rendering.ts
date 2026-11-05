export type CanvasRenderDimensions = {
  cssWidth: number;
  cssHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  outputScale: number;
};

// Bound each backing store, including the staging canvas, independently of zoom.
const MAX_CANVAS_AXIS = 8192;
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

export function getCanvasRenderDimensions(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  zoom = 1,
): CanvasRenderDimensions {
  const normalizedWidth = Math.max(1, cssWidth);
  const normalizedHeight = Math.max(1, cssHeight);
  const outputScale = Math.min(
    Math.max(1, devicePixelRatio || 1),
    MAX_CANVAS_AXIS / Math.max(normalizedWidth, normalizedHeight),
    Math.sqrt(MAX_CANVAS_PIXELS / (normalizedWidth * normalizedHeight)),
  );

  return {
    cssWidth: normalizedWidth,
    cssHeight: normalizedHeight,
    canvasWidth: Math.max(1, Math.floor(normalizedWidth * outputScale)),
    canvasHeight: Math.max(1, Math.floor(normalizedHeight * outputScale)),
    outputScale,
  };
}

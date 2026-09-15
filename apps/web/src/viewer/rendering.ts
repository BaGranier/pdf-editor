export type CanvasRenderDimensions = {
  cssWidth: number;
  cssHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  outputScale: number;
};

export function getCanvasRenderDimensions(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): CanvasRenderDimensions {
  const outputScale = Math.max(1, devicePixelRatio || 1);
  const normalizedWidth = Math.max(1, cssWidth);
  const normalizedHeight = Math.max(1, cssHeight);

  return {
    cssWidth: normalizedWidth,
    cssHeight: normalizedHeight,
    canvasWidth: Math.floor(normalizedWidth * outputScale),
    canvasHeight: Math.floor(normalizedHeight * outputScale),
    outputScale,
  };
}

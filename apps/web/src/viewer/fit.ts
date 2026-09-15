export type FitScaleInput = {
  pageWidth: number;
  pageHeight: number;
  containerWidth: number;
  containerHeight: number;
  padding?: number;
  minScale?: number;
  maxScale?: number;
};

export function computeFitScale({
  pageWidth,
  pageHeight,
  containerWidth,
  containerHeight,
  padding = 16,
  minScale = 0.1,
  maxScale = Number.POSITIVE_INFINITY,
}: FitScaleInput) {
  if (pageWidth <= 0 || pageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return minScale;
  }

  const availableWidth = Math.max(1, containerWidth - padding * 2);
  const availableHeight = Math.max(1, containerHeight - padding * 2);
  const fitScale = Math.min(availableWidth / pageWidth, availableHeight / pageHeight);

  return Math.min(maxScale, Math.max(minScale, fitScale));
}

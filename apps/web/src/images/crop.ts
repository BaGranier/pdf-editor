import type { ImageCrop, PdfRect } from "../editing/types";

export const FULL_IMAGE_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };

export function validImageCrop(crop: ImageCrop): boolean {
  return Object.values(crop).every(Number.isFinite) && crop.x >= 0 && crop.y >= 0 &&
    crop.width > 0 && crop.height > 0 && crop.x + crop.width <= 1 + 1e-8 && crop.y + crop.height <= 1 + 1e-8;
}

/** Preserve the current source-to-page scale when applying or resetting a crop. */
export function croppedImageRect(rect: PdfRect, previous: ImageCrop, next: ImageCrop): PdfRect {
  const sx = (rect.x1 - rect.x0) / previous.width;
  const sy = (rect.y1 - rect.y0) / previous.height;
  const x0 = rect.x0 + (next.x - previous.x) * sx;
  const y1 = rect.y1 - (next.y - previous.y) * sy;
  return { x0, y1, x1: x0 + next.width * sx, y0: y1 - next.height * sy };
}

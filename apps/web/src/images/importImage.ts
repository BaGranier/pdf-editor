import { jpegOrientation } from "./jpegOrientation";
import type { SignatureImage } from "../editing/types";
import { MAX_IMAGE_BYTES, rasterDimensions, validateImageDimensions } from "./imagePolicy";

export type ImageDraft = Omit<SignatureImage, "id">;
export { MAX_IMAGE_BYTES } from "./imagePolicy";

export async function importLocalImage(file: File): Promise<ImageDraft> {
  const mimeType = file.type || (/\.png$/i.test(file.name) ? "image/png" : /\.jpe?g$/i.test(file.name) ? "image/jpeg" : "");
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") throw new Error("Choisissez une image PNG ou JPEG.");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Image vide ou budget de lecture dépassé (32 Mio compressés, buffers temporaires limités à 128 Mio).");
  const header = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture des dimensions impossible."));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(file);
  });
  validateImageDimensions(...rasterDimensions(header, mimeType));
  let dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("L’image n’a pas pu être lue."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image invalide."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Le fichier image est invalide."));
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });
  const width = image.naturalWidth, height = image.naturalHeight;
  validateImageDimensions(width, height);
  if (mimeType === "image/jpeg") {
    if (jpegOrientation(header) !== 1) {
      // Browsers decode EXIF orientation; materialize those pixels for PDF export.
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("La normalisation de l’image est indisponible.");
      try {
        context.drawImage(image, 0, 0);
        dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      } finally { canvas.width = 0; canvas.height = 0; }
      if (dataUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) throw new Error("L’image normalisée dépasse le budget de lecture de 32 Mio.");
    }
  }
  return { mimeType, dataUrl, width, height };
}

import type { SignatureImage } from "../editing/types";

// One 40 Mpx bitmap needs up to 160 MB for RGBA. Encoded buffers/dataURL/hash
// copies have a separate 128 MiB transient budget (four encoded copies).
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_AXIS = 20_000;
export const MAX_IMAGE_BYTES = 128 * 1024 * 1024 / 4;
export const MAX_SESSION_RGBA_BYTES = 512 * 1024 * 1024;
export const MAX_SESSION_ENCODED_BYTES = 192 * 1024 * 1024;

export function validateImageDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 ||
    width > MAX_IMAGE_AXIS || height > MAX_IMAGE_AXIS || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("L’image dépasse les dimensions autorisées : 40 millions de pixels (160 Mo RGBA), 20 000 pixels par axe.");
  }
}

/** Inspect headers before asking the browser to decode/allocate a bitmap. */
export function rasterDimensions(buffer: ArrayBuffer, mime: string): [number, number] {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (mime === "image/png" && bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    String.fromCharCode(...bytes.slice(12, 16)) === "IHDR") {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      }
      if (marker === 218) break;
      offset += length;
    }
  }
  throw new Error("Le fichier image est invalide (dimensions PNG/JPEG illisibles).");
}

export function validateImageSession(assets: readonly SignatureImage[], incoming: SignatureImage) {
  const unique = new Map(assets.map((asset) => [asset.id, asset]));
  unique.set(incoming.id, incoming);
  let rgba = 0, encoded = 0;
  for (const asset of unique.values()) {
    rgba += asset.width * asset.height * 4;
    encoded += Math.ceil(asset.dataUrl.length * 3 / 4);
  }
  if (rgba > MAX_SESSION_RGBA_BYTES || encoded > MAX_SESSION_ENCODED_BYTES) {
    throw new Error("La session dépasse son budget d’images (512 Mio décodés ou 192 Mio compressés). Fermez des documents avant d’ajouter cette image.");
  }
}

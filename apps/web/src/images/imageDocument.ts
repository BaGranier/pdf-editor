import { rasterDimensions, validateImageDimensions, MAX_IMAGE_BYTES } from "./imagePolicy";
import { jpegOrientation } from "./jpegOrientation";

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export type ImageSource = {
  kind: "image";
  original: Blob;
  mimeType: ImageMime;
  widthPx: number;
  heightPx: number;
};
export type SourceMedia = { kind: "pdf" } | ImageSource;
export type ImageTransform = { type: "crop"; x: number; y: number; width: number; height: number } | { type: "rotate" | "mirror_horizontal" | "mirror_vertical" };
export type ImageLayout = {
  transforms?: ImageTransform[];
  pageSize: "image" | "a4" | "letter";
  orientation: "auto" | "portrait" | "landscape";
  margin: number;
  fit: "contain" | "no-upscale";
  background: string;
};
export const DEFAULT_IMAGE_LAYOUT: ImageLayout = { pageSize: "image", orientation: "auto", margin: 0, fit: "contain", background: "#ffffff" };
export const DOCUMENT_ACCEPT = "application/pdf,.pdf,image/png,.png,image/jpeg,.jpg,.jpeg,image/webp,.webp";

export function inspectImage(buffer: ArrayBuffer): Omit<ImageSource, "kind" | "original"> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  let mimeType: ImageMime, width: number, height: number;
  if (bytes[0] === 137 && bytes[1] === 80) {
    mimeType = "image/png";
    [width, height] = rasterDimensions(buffer, mimeType);
    // APNG is deliberately excluded along with animated WebP.
    for (let at = 8; at + 12 <= bytes.length;) {
      const size = view.getUint32(at);
      const kind = String.fromCharCode(...bytes.slice(at + 4, at + 8));
      if (kind === "acTL") throw new Error("Les images animées ne sont pas prises en charge.");
      if (at + size + 12 > bytes.length) throw new Error("PNG corrompu.");
      at += size + 12;
    }
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    mimeType = "image/jpeg";
    [width, height] = rasterDimensions(buffer, mimeType);
    if (jpegOrientation(buffer) >= 5) [width, height] = [height, width];
  } else if (bytes.length >= 30 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    mimeType = "image/webp";
    if (view.getUint32(4, true) + 8 !== bytes.length) throw new Error("WebP corrompu.");
    [width, height] = webpDimensions(bytes, view);
  } else throw new Error("Format non pris en charge. Choisissez un PDF, PNG, JPEG ou WebP statique.");
  validateImageDimensions(width, height);
  return { mimeType, widthPx: width, heightPx: height };
}

function webpDimensions(bytes: Uint8Array, view: DataView): [number, number] {
  let canvas: [number, number] | undefined;
  let raster: [number, number] | undefined;
  const uint24 = (offset: number) => view.getUint32(offset, true) & 0xffffff;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    offset = start + length + (length % 2);
    if (offset > bytes.length) throw new Error("WebP corrompu.");

    if (kind === "ANIM" || kind === "ANMF") throw new Error("Les images animées ne sont pas prises en charge.");
    if (kind === "EXIF") throw new Error("L’orientation EXIF WebP n’est pas prise en charge. Utilisez PNG ou JPEG.");
    if (kind === "VP8X") {
      if (start !== 20 || length !== 10) throw new Error("En-tête WebP invalide.");
      if (bytes[start] & 2) throw new Error("Les images animées ne sont pas prises en charge.");
      canvas = [
        uint24(start + 4) + 1,
        bytes[start + 7] + bytes[start + 8] * 256 + bytes[start + 9] * 65536 + 1,
      ];
      validateImageDimensions(...canvas);
    }
    if (kind !== "VP8 " && kind !== "VP8L") continue;
    if (raster) throw new Error("Plusieurs flux d’image WebP.");
    if (kind === "VP8L" && length >= 5 && bytes[start] === 47) {
      const packed = view.getUint32(start + 1, true);
      raster = [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    } else if (kind === "VP8 " && length >= 10 &&
      bytes[start + 3] === 157 && bytes[start + 4] === 1 && bytes[start + 5] === 42) {
      raster = [view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff];
    } else {
      throw new Error("Dimensions WebP invalides.");
    }
    validateImageDimensions(...raster);
  }
  if (offset !== bytes.length || !raster || (canvas && (canvas[0] !== raster[0] || canvas[1] !== raster[1]))) {
    throw new Error("Dimensions WebP incohérentes.");
  }
  return raster;
}

export async function readImageSource(file: Blob): Promise<ImageSource> {
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error("Image vide ou trop volumineuse (32 Mio maximum).");
  const metadata = inspectImage(await file.arrayBuffer());
  return { kind: "image", original: file, ...metadata };
}

/** MuPDF 1.26.3 has no WebP decoder. Normalize only WebP, once in the browser. */
async function normalizedUpload(source: ImageSource): Promise<Blob> {
  if (source.mimeType !== "image/webp") return source.original;
  const url = URL.createObjectURL(new Blob([source.original], { type: source.mimeType }));
  const canvas = document.createElement("canvas");
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("WebP illisible dans ce navigateur.")); image.src = url; });
    validateImageDimensions(image.naturalWidth, image.naturalHeight);
    if (image.naturalWidth !== source.widthPx || image.naturalHeight !== source.heightPx) throw new Error("Dimensions WebP incohérentes.");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Décodage WebP indisponible.");
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Conversion WebP impossible.")), "image/png"));
    if (png.size > MAX_IMAGE_BYTES) throw new Error("Le WebP normalisé dépasse 32 Mio.");
    return png;
  } finally { URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0; }
}

export async function createImagePdf(backendUrl: string, sources: ImageSource[], layout = DEFAULT_IMAGE_LAYOUT, signal?: AbortSignal): Promise<Blob> {
  if (!sources.length || sources.length > 250 || sources.reduce((n, s) => n + s.widthPx * s.heightPx, 0) > 128_000_000 || sources.reduce((n, s) => n + s.original.size, 0) > 192 * 1024 * 1024) throw new Error("Budget de conversion dépassé : 250 images, 128 Mpx ou 192 Mio maximum.");
  const form = new FormData();
  let uploadBytes = 0;
  for (const source of sources) {
    signal?.throwIfAborted();
    const blob = await normalizedUpload(source);
    signal?.throwIfAborted();
    uploadBytes += blob.size;
    if (uploadBytes > 192 * 1024 * 1024) throw new Error("Les images normalisées dépassent 192 Mio.");
    form.append("files", blob, source.mimeType === "image/jpeg" ? "source.jpg" : "source.png");
  }
  form.append("options", JSON.stringify(layout));
  let response: Response;
  try { response = await fetch(`${backendUrl}/images/pdf`, { method: "POST", body: form, signal }); }
  catch (error) { if (signal?.aborted) throw error; throw new Error("Le moteur PDF local est indisponible pour convertir l’image."); }
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(typeof detail?.detail === "string" ? detail.detail : "Conversion de l’image impossible.");
  }
  return response.blob();
}

export function validateImageDocumentSession(sources: ImageSource[]) {
  const bytes = sources.reduce((total, source) => total + source.original.size, 0);
  const rgba = sources.reduce((total, source) => total + source.widthPx * source.heightPx * 4, 0);
  if (bytes > 192 * 1024 * 1024 || rgba > 512 * 1024 * 1024) throw new Error("Budget de documents image dépassé (192 Mio compressés ou 512 Mio RGBA). Fermez des images avant de poursuivre.");
}

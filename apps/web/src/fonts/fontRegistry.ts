import { BUNDLED_FONTS, BUILT_IN_FONT_CATALOG, getBuiltInFont, type FontFaceDescriptor } from "./catalog";

export type CustomFontRecord = FontFaceDescriptor & {
  source: "custom";
  originalFileName: string;
  format: "ttf" | "otf";
  size: number;
  sha256: string;
  binary: Blob;
  createdAt: number;
};

const DB_NAME = "pdf-studio-font-library";
const STORE = "fonts";
const DB_VERSION = 1;
const MAX_FONT_SIZE = 20 * 1024 * 1024;
const memoryFonts = new Map<string, CustomFontRecord>();
const loadedFaces = new Map<string, Promise<void>>();
let protectedFontRefs = new Set<string>();

function openFontDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(STORE)) {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    }
  });
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function sha256(blob: Blob) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}

function detectFontFormat(bytes: Uint8Array): "ttf" | "otf" | null {
  if (bytes.length < 4) return null;
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  if (signature === "OTTO") return "otf";
  if (signature === "true" || signature === "typ1" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return "ttf";
  return null;
}

export async function importCustomFont(file: File): Promise<{ font: CustomFontRecord; duplicate: boolean }> {
  if (file.size === 0) throw new Error("Le fichier de police est vide.");
  if (file.size > MAX_FONT_SIZE) throw new Error("La police dépasse la limite de 20 Mo.");
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const format = detectFontFormat(bytes);
  if (!format || !/\.(ttf|otf)$/i.test(file.name)) throw new Error("Choisissez une police .ttf ou .otf valide.");
  const digest = await sha256(file);
  const id = `custom:${digest}`;
  const existing = await getCustomFont(id);
  if (existing) return { font: existing, duplicate: true };
  const family = file.name.replace(/\.(ttf|otf)$/i, "").replace(/[-_]+/g, " ");
  const font: CustomFontRecord = {
    id, family, displayName: family, source: "custom", category: "sans-serif",
    weight: 400, style: "normal", embeddable: true, originalFileName: file.name,
    format, size: file.size, sha256: digest, binary: file, createdAt: Date.now(),
  };
  memoryFonts.set(id, font);
  const database = await openFontDatabase().catch(() => null);
  if (database) {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(font);
    await transactionDone(transaction).finally(() => database.close());
  }
  return { font, duplicate: false };
}

export async function getCustomFont(id: string): Promise<CustomFontRecord | null> {
  const memory = memoryFonts.get(id);
  if (memory) return memory;
  const database = await openFontDatabase().catch(() => null);
  if (!database) return null;
  try {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).get(id);
    const value = await new Promise<CustomFontRecord | undefined>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    if (value) memoryFonts.set(value.id, value);
    return value ?? null;
  } finally { database.close(); }
}

export async function listCustomFonts(): Promise<CustomFontRecord[]> {
  const database = await openFontDatabase().catch(() => null);
  if (!database) return [...memoryFonts.values()];
  try {
    const request = database.transaction(STORE, "readonly").objectStore(STORE).getAll();
    const fonts = await new Promise<CustomFontRecord[]>((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
    fonts.forEach((font) => memoryFonts.set(font.id, font));
    return fonts;
  } finally { database.close(); }
}

export async function removeCustomFont(id: string) {
  if (protectedFontRefs.has(id)) {
    throw new Error("Cette police est encore utilisée par un document ouvert. Remplacez-la avant de la supprimer.");
  }
  memoryFonts.delete(id);
  loadedFaces.delete(id);
  const database = await openFontDatabase().catch(() => null);
  if (!database) return;
  const transaction = database.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(id);
  await transactionDone(transaction).finally(() => database.close());
}

export function setProtectedFontRefs(fontRefs: Iterable<string>) {
  protectedFontRefs = new Set(fontRefs);
}

export async function getFont(fontRef: string): Promise<FontFaceDescriptor | CustomFontRecord | null> {
  return getBuiltInFont(fontRef) ?? (fontRef.startsWith("custom:") ? getCustomFont(fontRef) : null);
}

export async function ensureFontLoaded(fontRef: string): Promise<void> {
  if (fontRef.startsWith("pdf-standard:") || fontRef.startsWith("document:")) return;
  const existing = loadedFaces.get(fontRef);
  if (existing) return existing;
  const loading = (async () => {
    const font = await getFont(fontRef);
    if (!font) throw new Error("La ressource de police est introuvable.");
    const source = "binary" in font ? URL.createObjectURL(font.binary) : font.assetUrl;
    if (!source || typeof FontFace === "undefined") return;
    const face = new FontFace(font.family, `url(${source})`, { weight: String(font.weight), style: font.style });
    try {
      await face.load();
      document.fonts.add(face);
    } finally {
      if ("binary" in font) URL.revokeObjectURL(source);
    }
  })();
  loadedFaces.set(fontRef, loading);
  try { await loading; } catch (error) { loadedFaces.delete(fontRef); throw error; }
}

export const fontRegistry = {
  builtIn: BUILT_IN_FONT_CATALOG,
  bundled: BUNDLED_FONTS,
  ensureLoaded: ensureFontLoaded,
  get: getFont,
  listCustom: listCustomFonts,
  importCustom: importCustomFont,
  removeCustom: removeCustomFont,
  setProtectedFontRefs,
};

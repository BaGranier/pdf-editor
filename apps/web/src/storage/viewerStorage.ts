export type ThemeMode = "light" | "dark";

export type ViewerPreferences = {
  theme: ThemeMode;
  sidebarVisible: boolean;
  activeDocumentId: string | null;
  documentOrder: string[];
};

export type StoredPdfDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  content: Blob;
  pageCount: number | null;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  updatedAt: number;
};

export type ViewerDocumentSnapshot = {
  id: string;
  fileName: string;
  mimeType: string;
  content: Blob;
  pageCount: number | null;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

const PREF_KEY = "pdf-editor-mvp:viewer-preferences";
const DB_NAME = "pdf-editor-mvp-db";
const DB_VERSION = 1;
const DOCUMENT_STORE = "documents";

const memoryDocuments = new Map<string, StoredPdfDocument>();

type RawViewerPreferences = {
  theme?: unknown;
  sidebarVisible?: unknown;
  activeDocumentId?: unknown;
  documentOrder?: unknown;
};

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function getSafeLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    });
  });
}

async function openDatabase() {
  if (!hasIndexedDb()) {
    return null;
  }

  const openRequest = window.indexedDB.open(DB_NAME, DB_VERSION);

  openRequest.addEventListener("upgradeneeded", () => {
    const database = openRequest.result;

    if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
      database.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
    }
  });

  return new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.addEventListener("success", () => {
      resolve(openRequest.result);
    });
    openRequest.addEventListener("error", () => {
      reject(openRequest.error ?? new Error("Unable to open IndexedDB database."));
    });
  });
}

export function serializeViewerPreferences(preferences: ViewerPreferences) {
  return JSON.stringify(preferences);
}

export function parseViewerPreferences(serialized: string | null): ViewerPreferences | null {
  if (!serialized) {
    return null;
  }

  try {
    const parsed = JSON.parse(serialized) as RawViewerPreferences;

    if (
      !isThemeMode(parsed.theme) ||
      typeof parsed.sidebarVisible !== "boolean" ||
      (parsed.activeDocumentId !== null && typeof parsed.activeDocumentId !== "string") ||
      !isStringArray(parsed.documentOrder)
    ) {
      return null;
    }

    return {
      theme: parsed.theme,
      sidebarVisible: parsed.sidebarVisible,
      activeDocumentId: parsed.activeDocumentId,
      documentOrder: parsed.documentOrder,
    };
  } catch {
    return null;
  }
}

export function loadViewerPreferences(): ViewerPreferences | null {
  const storage = getSafeLocalStorage();

  if (!storage) {
    return null;
  }

  return parseViewerPreferences(storage.getItem(PREF_KEY));
}

export function saveViewerPreferences(preferences: ViewerPreferences) {
  const storage = getSafeLocalStorage();

  if (!storage) {
    return;
  }

  storage.setItem(PREF_KEY, serializeViewerPreferences(preferences));
}

export function clearViewerPreferences() {
  const storage = getSafeLocalStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(PREF_KEY);
}

export async function clearViewerStorage() {
  clearViewerPreferences();
  await clearStoredDocuments();
}

export function toStoredPdfDocument(snapshot: ViewerDocumentSnapshot): StoredPdfDocument {
  return {
    id: snapshot.id,
    fileName: snapshot.fileName,
    mimeType: snapshot.mimeType,
    content: snapshot.content,
    pageCount: snapshot.pageCount,
    zoom: snapshot.zoom,
    scrollLeft: snapshot.scrollLeft,
    scrollTop: snapshot.scrollTop,
    updatedAt: Date.now(),
  };
}

async function putStoredDocument(snapshot: ViewerDocumentSnapshot) {
  const storedDocument = toStoredPdfDocument(snapshot);

  if (!hasIndexedDb()) {
    memoryDocuments.set(storedDocument.id, storedDocument);
    return;
  }

  const database = await openDatabase();

  if (!database) {
    memoryDocuments.set(storedDocument.id, storedDocument);
    return;
  }

  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
    const store = transaction.objectStore(DOCUMENT_STORE);
    store.put(storedDocument);

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () => reject(transaction.error ?? new Error("Unable to save document.")));
      transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("Unable to save document.")));
    });
  } finally {
    database.close();
  }
}

export async function saveStoredDocument(snapshot: ViewerDocumentSnapshot) {
  try {
    await putStoredDocument(snapshot);
  } catch {
    memoryDocuments.set(snapshot.id, toStoredPdfDocument(snapshot));
  }
}

export async function loadStoredDocument(documentId: string) {
  if (!hasIndexedDb()) {
    return memoryDocuments.get(documentId) ?? null;
  }

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
  } catch {
    return memoryDocuments.get(documentId) ?? null;
  }

  if (!database) {
    return memoryDocuments.get(documentId) ?? null;
  }

  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readonly");
    const store = transaction.objectStore(DOCUMENT_STORE);
    const result = await requestToPromise<StoredPdfDocument | undefined>(store.get(documentId));
    return result ?? null;
  } finally {
    database.close();
  }
}

export async function loadStoredDocuments(documentIds: string[]) {
  const loadedDocuments = await Promise.all(documentIds.map((documentId) => loadStoredDocument(documentId)));
  return loadedDocuments.filter((document): document is StoredPdfDocument => document !== null);
}

export async function removeStoredDocument(documentId: string) {
  if (!hasIndexedDb()) {
    memoryDocuments.delete(documentId);
    return;
  }

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
  } catch {
    memoryDocuments.delete(documentId);
    return;
  }

  if (!database) {
    memoryDocuments.delete(documentId);
    return;
  }

  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
    transaction.objectStore(DOCUMENT_STORE).delete(documentId);

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("Unable to delete document.")),
      );
      transaction.addEventListener("abort", () =>
        reject(transaction.error ?? new Error("Unable to delete document.")),
      );
    });
  } finally {
    database.close();
  }
}

export async function clearStoredDocuments() {
  if (!hasIndexedDb()) {
    memoryDocuments.clear();
    return;
  }

  let database: IDBDatabase | null = null;

  try {
    database = await openDatabase();
  } catch {
    memoryDocuments.clear();
    return;
  }

  if (!database) {
    memoryDocuments.clear();
    return;
  }

  try {
    const transaction = database.transaction(DOCUMENT_STORE, "readwrite");
    transaction.objectStore(DOCUMENT_STORE).clear();

    await new Promise<void>((resolve, reject) => {
      transaction.addEventListener("complete", () => resolve());
      transaction.addEventListener("error", () =>
        reject(transaction.error ?? new Error("Unable to clear documents.")),
      );
      transaction.addEventListener("abort", () =>
        reject(transaction.error ?? new Error("Unable to clear documents.")),
      );
    });
  } finally {
    database.close();
  }
}

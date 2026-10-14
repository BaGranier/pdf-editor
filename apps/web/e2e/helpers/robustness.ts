import path from "node:path";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { expect, type Page, type TestInfo } from "@playwright/test";
import type { PdfEdit, SignatureImage } from "../../src/editing/types";

export const root = path.resolve(process.cwd(), "../..");
export const corpus = path.join(root, "data/output/editor-robustness-008");
export const python = path.join(root, "services/pdf-engine/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
export function ensureCorpus() {
  execFileSync(python, ["-m", "scripts.prepare-qa-assets", "--mode", "browser", "--skip-large"], { cwd: root });
}
export function scene() {
  return JSON.parse(readFileSync(path.join(corpus, "scene.json"), "utf8")) as { edits: PdfEdit[]; assets: SignatureImage[] };
}
export function manifest() {
  return JSON.parse(readFileSync(path.join(corpus, "manifest.json"), "utf8")) as { assets: Array<{ fileName: string; width: number; height: number; bytes: number; sha256: string; mimeType: "image/png" | "image/jpeg" }>; totalBytes: number };
}
export function stressAssets(): SignatureImage[] {
  return manifest().assets.map((asset) => ({ ...asset, id: `image-${asset.sha256}`, dataUrl: `data:${asset.mimeType};base64,${readFileSync(path.join(corpus, asset.fileName)).toString("base64")}` }));
}
export async function seed(page: Page, documents: Array<{ id: string; edits: PdfEdit[]; dirty?: boolean }>, assets: SignatureImage[]) {
  await page.goto("/fonts/NOTICE.md");
  const source = [...readFileSync(path.join(corpus, "scene.pdf"))];
  await page.evaluate(async ({ documents, assets, source }) => {
    const modulePath = "/src/storage/viewerStorage.ts";
    const storage = await import(/* @vite-ignore */ modulePath);
    await storage.clearViewerStorage();
    for (const doc of documents) {
      const ok = await storage.saveStoredDocument({ id: doc.id, fileName: `${doc.id}.pdf`,
        mimeType: "application/pdf", content: new Blob([new Uint8Array(source)], { type: "application/pdf" }),
        pageCount: 1, zoom: 1, scrollLeft: 0, scrollTop: 0,
        edits: doc.edits, editsDirty: doc.dirty ?? false, imageAssets: assets });
      if (!ok) throw new Error("Unable to seed synthetic QA data");
    }
    storage.saveViewerPreferences({ theme: "light", sidebarVisible: true, activeDocumentId: documents[0].id, documentOrder: documents.map((doc) => doc.id) });
  }, { documents, assets, source });
  await page.goto("/");
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
}
export async function state(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const transaction = db.transaction(["documents", "images"]);
      const docsRequest = transaction.objectStore("documents").getAll();
      const imagesRequest = transaction.objectStore("images").getAll();
      const [docs, assets] = await Promise.all([
        new Promise<Array<{id: string; fileName: string; content: Blob; edits?: Array<{id: string; type: string; imageId?: string; crop?: unknown; rect: unknown}>; editsDirty?: boolean}>>((resolve) => { docsRequest.onsuccess = () => resolve(docsRequest.result); }),
        new Promise<Array<{id: string; dataUrl: string}>>((resolve) => { imagesRequest.onsuccess = () => resolve(imagesRequest.result); }),
      ]);
      const estimate = await navigator.storage?.estimate?.();
      return { docs: docs.map(({content, ...rest}) => ({...rest, sourceBytes: content.size})),
        assetCount: assets.length, assetIds: assets.map((asset) => asset.id),
        logicalAssetBytes: assets.reduce((sum, asset) => sum + Math.ceil(asset.dataUrl.length * 3 / 4), 0),
        canvases: document.querySelectorAll("canvas").length,
        viewerCanvases: document.querySelectorAll(".viewer canvas").length,
        storageUsage: estimate?.usage ?? null,
        heap: (performance as Performance & { memory?: {usedJSHeapSize: number} }).memory?.usedJSHeapSize ?? null };
    } finally { db.close(); }
  });
}
export async function exportPdf(page: Page, info: TestInfo, name: string, quality = "maximum") {
  const sourceTitle = await page.locator('.document-select[aria-current="true"]').getAttribute("title");
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter / Finaliser…", exact: true }).click();
  await page.getByLabel("Profil de compression").selectOption(quality);
  const download = page.waitForEvent("download");
  const response = page.waitForResponse((response) => response.url().endsWith("/pdf/export/organize"));
  const started = Date.now();
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(200);
  const destination = info.outputPath(`${name}.pdf`);
  await (await download).saveAs(destination);
  await expect(page.locator('.document-select[aria-current="true"]')).not.toHaveAttribute("title", sourceTitle!);
  return { destination, durationMs: Date.now() - started, fileName: await page.locator('.document-select[aria-current="true"]').getAttribute("title") };
}
export async function selectObject(page: Page, id: string, edits: PdfEdit[]) {
  const index = edits.slice().reverse().findIndex((edit) => edit.id === id);
  await page.getByRole("region", { name: "Objets de la page", exact: true }).getByRole("button").nth(index).click();
}

import path from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { fixtureDirectory, fixtures } from "../helpers/app";

test("EXPORT-PRESENTATION-003-7 restaure IndexedDB v1 sans supprimer la source", async ({ page }) => {
  // Static same-origin resource: seed the old schema before running React.
  await page.goto("/fonts/NOTICE.md");
  const bytes = [...readFileSync(fixtures.onePage)];
  await page.evaluate(async (source) => {
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("documents", { keyPath: "id" });
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("documents", "readwrite");
      tx.objectStore("documents").put({ id: "legacy", fileName: "legacy.pdf", content: new Blob([new Uint8Array(source)], { type: "application/pdf" }), mimeType: "application/pdf", pageCount: 1, zoom: 1, scrollLeft: 0, scrollTop: 0, workingSaveName: "legacy-copy.pdf", updatedAt: Date.now() });
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("pdf-editor-mvp:viewer-preferences", JSON.stringify({ theme: "light", sidebarVisible: true, activeDocumentId: "legacy", documentOrder: ["legacy"] }));
  }, bytes);
  await page.goto("/");
  await expect(page.locator(".document-select")).toHaveCount(1);
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
  await page.getByLabel("Fichier image").setInputFiles(path.join(fixtureDirectory, "editor-image.png"));
  await expect(page.locator("[data-image-edit-id]")).toHaveCount(1);
  await expect.poll(async () => page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const record = await new Promise<{ content: Blob; edits?: unknown[] }>((resolve) => { const get = db.transaction("documents").objectStore("documents").get("legacy"); get.onsuccess = () => resolve(get.result); });
    const result = { version: db.version, images: db.objectStoreNames.contains("images"), edits: record.edits?.length ?? 0 };
    db.close(); return result;
  })).toEqual({ version: 2, images: true, edits: 1 });
  const restored = await page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db");
    const db = await new Promise<IDBDatabase>((resolve) => { request.onsuccess = () => resolve(request.result); });
    const record = await new Promise<{ content: Blob }>((resolve) => { const get = db.transaction("documents").objectStore("documents").get("legacy"); get.onsuccess = () => resolve(get.result); });
    db.close(); return [...new Uint8Array(await record.content.arrayBuffer())];
  });
  expect(restored).toEqual(bytes);
  await page.reload(); await expect(page.locator("[data-image-edit-id]")).toHaveCount(1);
});

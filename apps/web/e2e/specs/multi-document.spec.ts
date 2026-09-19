import { existsSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

async function sampleLargeDocumentResources(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const canvas = [...document.querySelectorAll<HTMLCanvasElement>(".pdf-page canvas")];
    const canvasPixels = canvas.reduce((total, element) => total + element.width * element.height, 0);
    const printFrames = document.querySelectorAll("iframe.pdf-print-frame").length;
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const documents = await new Promise<Array<{ content?: Blob }>>((resolve, reject) => {
      const transaction = database.transaction("documents", "readonly");
      const getAll = transaction.objectStore("documents").getAll();
      getAll.onsuccess = () => resolve(getAll.result);
      getAll.onerror = () => reject(getAll.error);
    });
    database.close();

    return {
      activePageCanvases: canvas.length,
      canvasPixels,
      activePrintFrames: printFrames,
      storedDocumentCount: documents.length,
      storedDocumentBytes: documents.reduce((total, entry) => total + (entry.content?.size ?? 0), 0),
    };
  });
}

test("QA-E2E-015 @slow @performance ouvre et ferme le PDF de robustesse", async ({
  page,
  qa,
}, testInfo) => {
  test.skip(
    !existsSync(fixtures.large),
    "Fixture > 50 Mo générée uniquement par la campagne complète.",
  );
  await openApp(page);

  const memoryBefore = await page.evaluate(() => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    return memory?.usedJSHeapSize ?? null;
  });
  await qa.measure("open-large-pdf", () => openPdf(page, fixtures.large));
  const resourcesAfterOpen = await sampleLargeDocumentResources(page);
  await expect(page.getByText(/250 pages/).first()).toBeVisible();
  await expect(page.getByText(/50 Mo/)).toBeVisible();
  await page.getByLabel("Mode d'affichage").selectOption("single-page");
  await page.getByTestId("pdf-viewer").focus();
  for (let index = 0; index < 10; index += 1) {
    await page.getByTestId("pdf-viewer").press("ArrowRight");
  }
  await expect(page.locator(".pdf-page").first()).toBeVisible();
  const resourcesAfterNavigation = await sampleLargeDocumentResources(page);
  // Single-page rendering is deliberately bounded to front/back buffers.
  expect(resourcesAfterNavigation.activePageCanvases).toBeLessThanOrEqual(2);
  expect(resourcesAfterNavigation.activePrintFrames).toBe(0);

  await qa.measure("close-large-pdf", async () => {
    await page.getByRole("button", { name: "Fermer pdf-large.pdf" }).click();
    await expect(page.locator(".document-item")).toHaveCount(0);
  });
  const resourcesAfterClose = await sampleLargeDocumentResources(page);
  expect(resourcesAfterClose.activePageCanvases).toBe(0);
  expect(resourcesAfterClose.activePrintFrames).toBe(0);
  expect(resourcesAfterClose.storedDocumentCount).toBe(0);
  expect(resourcesAfterClose.storedDocumentBytes).toBe(0);
  const memoryAfter = await page.evaluate(() => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    return memory?.usedJSHeapSize ?? null;
  });
  await testInfo.attach("memory-sample", {
    body: Buffer.from(
      JSON.stringify({
        scope: "Heap JavaScript de la page uniquement; ne représente pas la mémoire totale.",
        beforeOpenBytes: memoryBefore,
        afterCloseBytes: memoryAfter,
        resourcesAfterOpen,
        resourcesAfterNavigation,
        resourcesAfterClose,
      }),
    ),
    contentType: "application/json",
  });
});

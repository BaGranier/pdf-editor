import { copyFileSync, existsSync } from "node:fs";
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

async function closeAllOpenDocuments(page: import("@playwright/test").Page) {
  while (await page.locator(".document-tab").count()) {
    await page.locator(".document-tab button[aria-label^='Fermer']").first().click();
    const discard = page.getByRole("button", { name: "Ignorer les modifications" });
    if (await discard.isVisible()) {
      await discard.click();
    }
  }
}

async function attachLargeDocumentSample(
  testInfo: import("@playwright/test").TestInfo,
  name: string,
  sample: unknown,
) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(sample, null, 2)),
    contentType: "application/json",
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
  await qa.measure("navigate-and-zoom-large-pdf", async () => {
    await page.getByLabel("Mode d'affichage").selectOption("single-page");
    await page.getByTestId("pdf-viewer").focus();
    for (let index = 0; index < 10; index += 1) {
      await page.getByTestId("pdf-viewer").press("ArrowRight");
    }
    const zoomOut = page.getByRole("button", { name: "Réduire le zoom" });
    while (await zoomOut.isEnabled()) {
      await zoomOut.click();
    }
    await expect(page.getByTestId("zoom-level")).toHaveText("50%");
    for (let index = 0; index < 10; index += 1) {
      await page.getByRole("button", { name: "Augmenter le zoom" }).click();
    }
    await expect(page.getByTestId("zoom-level")).toHaveText("150%");
  });
  await expect(page.locator(".pdf-page").first()).toBeVisible();
  const resourcesAfterNavigation = await sampleLargeDocumentResources(page);
  // Single-page rendering is deliberately bounded to front/back buffers.
  expect(resourcesAfterNavigation.activePageCanvases).toBeLessThanOrEqual(2);
  expect(resourcesAfterNavigation.activePrintFrames).toBe(0);

  await qa.measure("close-large-pdf", async () => {
    await page.getByRole("button", { name: "Fermer pdf-large.pdf" }).click();
    await expect(page.locator(".document-tab")).toHaveCount(0);
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

test("PERF-MEMORY-002 @slow @performance répète les cycles ouverture-fermeture d'un gros PDF", async ({
  page,
  qa,
}, testInfo) => {
  test.skip(
    !existsSync(fixtures.large),
    "Fixture > 50 Mo générée uniquement par la campagne complète.",
  );
  await openApp(page);
  const cycles: Array<{
    cycle: number;
    afterOpen: Awaited<ReturnType<typeof sampleLargeDocumentResources>>;
    afterClose: Awaited<ReturnType<typeof sampleLargeDocumentResources>>;
  }> = [];

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await qa.measure(`open-large-cycle-${cycle}`, () => openPdf(page, fixtures.large));
    await page.getByLabel("Mode d'affichage").selectOption("single-page");
    await page.getByTestId("pdf-viewer").press("PageDown");
    const afterOpen = await sampleLargeDocumentResources(page);
    expect(afterOpen.activePageCanvases).toBeLessThanOrEqual(2);
    expect(afterOpen.activePrintFrames).toBe(0);

    await qa.measure(`close-large-cycle-${cycle}`, async () => {
      await page.getByRole("button", { name: "Fermer pdf-large.pdf" }).click();
      await expect(page.locator(".document-tab")).toHaveCount(0);
    });
    const afterClose = await sampleLargeDocumentResources(page);
    expect(afterClose.activePageCanvases).toBe(0);
    expect(afterClose.activePrintFrames).toBe(0);
    expect(afterClose.storedDocumentCount).toBe(0);
    expect(afterClose.storedDocumentBytes).toBe(0);
    cycles.push({ cycle, afterOpen, afterClose });
  }

  await attachLargeDocumentSample(testInfo, "large-document-cycles", {
    scope: "Les ressources DOM et IndexedDB sont des invariants structurels ; le heap absolu dépend du moteur.",
    cycles,
  });
});

test("PERF-MEMORY-002 @slow @performance isole deux gros documents puis libère chacun", async ({
  page,
  qa,
}, testInfo) => {
  test.skip(
    !existsSync(fixtures.large),
    "Fixture > 50 Mo générée uniquement par la campagne complète.",
  );
  await openApp(page);
  const secondLargePdf = testInfo.outputPath("pdf-large-b.pdf");
  copyFileSync(fixtures.large, secondLargePdf);
  await qa.measure("open-large-document-a", () => openPdf(page, fixtures.large));
  await qa.measure("open-large-document-b", () => openPdf(page, secondLargePdf));
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await page.getByLabel("Mode d'affichage").selectOption("single-page");
  await page.locator(".document-select").first().click();
  await expect(page.getByRole("region", { name: "Aperçu PDF pdf-large.pdf" })).toBeVisible();
  await page.locator(".document-select").nth(1).click();
  await expect(page.getByRole("region", { name: "Aperçu PDF pdf-large-b.pdf" })).toBeVisible();
  await expect.poll(async () => (await sampleLargeDocumentResources(page)).storedDocumentCount).toBe(2);
  const afterOpen = await sampleLargeDocumentResources(page);
  expect(afterOpen.storedDocumentCount).toBe(2);
  expect(afterOpen.storedDocumentBytes).toBeGreaterThan(100 * 1024 * 1024);

  await qa.measure("close-large-document-a", async () => {
    await page.locator(".document-tab button[aria-label='Fermer pdf-large.pdf']").first().click();
    await expect(page.locator(".document-tab")).toHaveCount(1);
  });
  const afterFirstClose = await sampleLargeDocumentResources(page);
  expect(afterFirstClose.activePageCanvases).toBeLessThanOrEqual(2);
  expect(afterFirstClose.storedDocumentCount).toBe(1);

  await qa.measure("close-large-document-b", async () => {
    await page.locator(".document-tab button[aria-label='Fermer pdf-large-b.pdf']").click();
    await expect(page.locator(".document-tab")).toHaveCount(0);
  });
  const afterSecondClose = await sampleLargeDocumentResources(page);
  expect(afterSecondClose.activePageCanvases).toBe(0);
  expect(afterSecondClose.storedDocumentCount).toBe(0);
  await attachLargeDocumentSample(testInfo, "large-document-multi-document", {
    afterOpen,
    afterFirstClose,
    afterSecondClose,
  });
});

test("PERF-MEMORY-002 @slow @performance exporte un gros PDF modifié sans conserver de ressource temporaire", async ({
  page,
  qa,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    !existsSync(fixtures.large),
    "Fixture > 50 Mo générée uniquement par la campagne complète.",
  );
  await openApp(page);
  await qa.measure("open-large-document-for-export", () => openPdf(page, fixtures.large));
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "add_text");
  const editLayerBox = await editLayer.boundingBox();
  expect(editLayerBox).not.toBeNull();
  if (!editLayerBox) {
    throw new Error("La couche d'édition du gros PDF n'est pas mesurable.");
  }
  await page.mouse.move(editLayerBox.x + 48, editLayerBox.y + 48);
  await page.mouse.down();
  await page.mouse.move(editLayerBox.x + 180, editLayerBox.y + 92, { steps: 3 });
  await page.mouse.up();
  await page.getByLabel("Texte ajouté page 1").fill("Mesure PERF-MEMORY-002");
  await page.getByRole("button", { name: "Organiser" }).click();
  await expect(page.getByRole("heading", { name: "Organiser les pages" })).toBeVisible();
  await page.getByLabel("Nom du PDF exporté").fill("qa-large-export.pdf");
  const downloadPromise = page.waitForEvent("download");
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/pdf/export/organize") && response.request().method() === "POST",
  );
  await qa.measure("export-large-document", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const [download, response] = await Promise.all([downloadPromise, responsePromise]);
  expect(response.ok()).toBe(true);
  await download.saveAs(testInfo.outputPath("qa-large-export.pdf"));
  await expect(page.locator(".document-tab")).toHaveCount(2);
  const afterExport = await sampleLargeDocumentResources(page);
  expect(afterExport.activePrintFrames).toBe(0);

  await closeAllOpenDocuments(page);
  const afterClose = await sampleLargeDocumentResources(page);
  expect(afterClose.activePageCanvases).toBe(0);
  expect(afterClose.activePrintFrames).toBe(0);
  expect(afterClose.storedDocumentCount).toBe(0);
  expect(afterClose.storedDocumentBytes).toBe(0);
  await attachLargeDocumentSample(testInfo, "large-document-export", {
    afterExport,
    afterClose,
  });
});

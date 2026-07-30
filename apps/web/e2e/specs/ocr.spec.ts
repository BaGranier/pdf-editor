import { writeFile } from "node:fs/promises";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function getStoredOcrBytes(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const documents = await new Promise<Array<{ fileName: string; content: Blob }>>(
        (resolve, reject) => {
          const transaction = database.transaction("documents", "readonly");
          const getAllRequest = transaction.objectStore("documents").getAll();
          getAllRequest.onsuccess = () => resolve(getAllRequest.result);
          getAllRequest.onerror = () => reject(getAllRequest.error);
        },
      );
      const ocrDocument = documents.find(
        (document) => document.fileName === "conversion-scan_OCR.pdf",
      );
      return ocrDocument
        ? Array.from(new Uint8Array(await ocrDocument.content.arrayBuffer()))
        : [];
    } finally {
      database.close();
    }
  });
}

test("QA-OCR-001 @smoke exécute un OCR réel et ouvre un PDF consultable", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionScan);

  await page.getByRole("button", { name: "OCR" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Reconnaissance de texte (OCR)",
  });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Langue du document").selectOption("eng");

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/ocr") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Lancer l’OCR" }).click();
  await expect(page.getByRole("status")).toContainText("OCR en cours…");

  const response = await qa.measure("ocr-scan", () => responsePromise);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/pdf");

  await expect(
    page.getByRole("button", {
      name: "conversion-scan_OCR.pdf, document actif",
    }),
  ).toBeVisible();
  await expect(page.locator(".document-item")).toHaveCount(2);
  await expect(page.getByRole("status")).toContainText(
    "OCR terminé. Le document OCR a été ouvert.",
  );

  await expect
    .poll(async () => (await getStoredOcrBytes(page)).length)
    .toBeGreaterThan(0);
  const outputPath = testInfo.outputPath("conversion-scan_OCR.pdf");
  await writeFile(outputPath, Buffer.from(await getStoredOcrBytes(page)));
  const validation = validatePdf(outputPath, 1);
  expect(validation.valid).toBe(true);
  expect(validation.text.toUpperCase()).toContain("SCANNED OCR WITNESS");

  await testInfo.attach("ocr-result", {
    body: Buffer.from(
      JSON.stringify({
        valid: validation.valid,
        pageCount: validation.pageCount,
        witnessText: "SCANNED OCR WITNESS",
        sourceRetained: true,
      }),
    ),
    contentType: "application/json",
  });
});

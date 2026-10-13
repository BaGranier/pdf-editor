import path from "node:path";
import { writeFile } from "node:fs/promises";
import { expect, test } from "../helpers/qa-test";
import { fixtureDirectory, getLocalState, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("OCR corrects a sideways scan and preserves its source", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, path.join(fixtureDirectory, "ocr-oriented-90.pdf"));
  await page.getByRole("button", { name: "OCR", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Reconnaissance de texte (OCR)" });
  await dialog.getByLabel("Langue du document").selectOption("fra+eng");
  await dialog.getByLabel("Correction de rotation des scans").selectOption("270");
  await dialog.getByRole("button", { name: "Lancer l’OCR" }).click();
  const name = "ocr-oriented-90_OCR.pdf";
  await expect(page.getByRole("button", { name: `${name}, document actif` })).toBeVisible();
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect.poll(async () => (await getLocalState(page)).documentCount).toBe(2);
  const bytes = await page.evaluate(async (name) => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("pdf-editor-mvp-db"); request.onsuccess = () => resolve(request.result);
    });
    const records = await new Promise<Array<{fileName: string; content: Blob}>>((resolve) => {
      const request = database.transaction("documents").objectStore("documents").getAll();
      request.onsuccess = () => resolve(request.result);
    });
    database.close();
    const content = records.find((record) => record.fileName === name)?.content;
    return content ? Array.from(new Uint8Array(await content.arrayBuffer())) : [];
  }, name);
  expect(bytes.length).toBeGreaterThan(0);
  const destination = testInfo.outputPath(name);
  await writeFile(destination, Buffer.from(bytes));
  const result = validatePdf(destination, 1);
  expect(result.valid).toBe(true);
  expect(result.text.replace(/\s+/g, " ")).toContain("ORIENTATION WITNESS");
  expect(result.text).toContain("été");
});

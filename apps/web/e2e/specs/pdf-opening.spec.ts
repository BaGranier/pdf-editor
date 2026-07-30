import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("QA-E2E-002 @smoke ouvre et rend un PDF valide", async ({ page, qa }) => {
  await openApp(page);
  await qa.measure("open-small-pdf", () => openPdf(page, fixtures.fivePages));

  await expect(page.getByText("5 pages", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".pdf-page")).toHaveCount(5);
  await expect(page.locator(".pdf-canvas").first()).toBeVisible();
});

test("QA-E2E-014 @smoke refuse un PDF corrompu puis accepte un PDF valide", async ({
  page,
  qa,
}) => {
  qa.allowError(/InvalidPDF|Invalid PDF|PDF.*corrupt|format error/i);
  await openApp(page);
  await page.getByLabel("Ouvrir un PDF").setInputFiles(fixtures.corrupted);

  await expect(
    page
      .getByRole("complementary", { name: "Documents ouverts" })
      .getByText("Impossible d'ouvrir pdf-corrupted.pdf."),
  ).toBeVisible();
  await expect(page.locator(".document-item")).toHaveCount(0);
  const persistedAfterFailure = await page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    const database = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve) => {
      const transaction = database.transaction("documents", "readonly");
      const countRequest = transaction.objectStore("documents").count();
      countRequest.onsuccess = () => resolve(countRequest.result);
    });
    database.close();
    return count;
  });
  expect(persistedAfterFailure).toBe(0);

  await openPdf(page, fixtures.onePage);
});

test("QA-E2E-016 @slow @regression garde huit documents accessibles", async ({
  page,
  qa,
}) => {
  await openApp(page);
  await qa.measure("open-eight-documents", async () => {
    for (let index = 0; index < 8; index += 1) {
      await page.getByLabel("Ouvrir un PDF").setInputFiles(fixtures.onePage);
      await expect(page.locator(".document-item")).toHaveCount(index + 1);
    }
  });

  await expect(page.locator(".document-item")).toHaveCount(8);
  await page.locator(".document-select").first().click();
  await expect(page.locator(".document-select").first()).toHaveAttribute("aria-current", "true");
  await page.locator(".document-close").first().click();
  await expect(page.locator(".document-item")).toHaveCount(7);
});

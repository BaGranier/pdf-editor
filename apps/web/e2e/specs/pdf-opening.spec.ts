import { expect, test } from "../helpers/qa-test";
import { fixtures, getStoredDocuments, openApp, openPdf } from "../helpers/app";

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
  await page.locator("input[type='file'][aria-label='Ouvrir un PDF']").setInputFiles(fixtures.corrupted);

  await expect(
    page
      .getByRole("complementary", { name: "Documents ouverts" })
      .getByText("Impossible d'ouvrir pdf-corrupted.pdf."),
  ).toBeVisible();
  await expect(page.locator(".document-tab")).toHaveCount(0);
  expect(await getStoredDocuments(page)).toHaveLength(0);

  await openPdf(page, fixtures.onePage);
});

test("QA-E2E-016 @slow @regression garde huit documents accessibles", async ({
  page,
  qa,
}) => {
  await openApp(page);
  await qa.measure("open-eight-documents", async () => {
    for (let index = 0; index < 8; index += 1) {
      await page.locator("input[type='file'][aria-label='Ouvrir un PDF']").setInputFiles(fixtures.onePage);
      await expect(page.locator(".document-tab")).toHaveCount(index + 1);
    }
  });

  await expect(page.locator(".document-tab")).toHaveCount(8);
  await page.locator(".document-select").first().click();
  await expect(page.locator(".document-select").first()).toHaveAttribute("aria-current", "true");
  await page.locator(".document-close").first().click();
  await expect(page.locator(".document-tab")).toHaveCount(7);
});

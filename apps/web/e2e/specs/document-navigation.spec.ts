import { expect, test } from "../helpers/qa-test";
import {
  activeDocumentButton,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";

test("QA-E2E-003 @smoke navigue et ferme plusieurs documents de façon cohérente", async ({
  page,
  qa,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await openPdf(page, fixtures.fivePages);
  await openPdf(page, fixtures.mixed);
  await expect(page.locator(".document-item")).toHaveCount(3);

  await qa.measure("switch-document", async () => {
    await page.getByRole("button", { name: "pdf-small-1-page.pdf", exact: true }).click();
    await expect(activeDocumentButton(page)).toHaveText(/pdf-small-1-page\.pdf/);
  });
  await expect(page.getByRole("button", { name: "Fermer pdf-small-5-pages.pdf" })).toBeVisible();
  await page.getByRole("button", { name: "Fermer pdf-small-5-pages.pdf" }).click();
  await expect(page.locator(".document-item")).toHaveCount(2);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-small-1-page\.pdf/);

  await page.getByRole("button", { name: "Fermer pdf-small-1-page.pdf" }).click();
  await expect(page.locator(".document-item")).toHaveCount(1);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-landscape-portrait\.pdf/);
});

import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
  organizedPages,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function prepareExportPlan(page: Parameters<typeof organizedPages>[0]): Promise<void> {
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Déplacer la page 1 vers la droite" })
    .click();
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Tourner la page 1 vers la droite" })
    .click();
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Dupliquer la page 1" })
    .click();
  await organizedPages(page).last().getByTitle("Retirer du plan d'organisation").click();
}

test("QA-E2E-012 @smoke exporte un plan complexe et valide le PDF avec pypdf", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  await enterOrganizeMode(page);
  await prepareExportPlan(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-export-organise.pdf");

  const downloadPromise = page.waitForEvent("download");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/pdf/export/organize") && response.request().method() === "POST",
  );
  await qa.measure("export-organized-pdf", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const [download, response] = await Promise.all([downloadPromise, responsePromise]);
  expect(response.ok()).toBe(true);

  const outputPath = testInfo.outputPath("qa-export-organise.pdf");
  await download.saveAs(outputPath);
  const exported = validatePdf(outputPath, 5);
  expect(exported.pages.map((item) => item.width)).toEqual([325, 325, 300, 350, 375]);
  expect(exported.pages.map((item) => item.rotation)).toEqual([90, 90, 0, 0, 0]);

  await expect(page.getByText(/PDF exporté avec succès/)).toBeVisible();
  await expect(page.locator(".document-item")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "pdf-small-5-pages.pdf", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "qa-export-organise.pdf, document actif" }),
  ).toBeVisible();
});

test("QA-E2E-013 @regression exporte plusieurs documents sans altérer les sources", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await openPdf(page, fixtures.fivePages);
  await enterOrganizeMode(page);
  await page.getByRole("button", { name: "Ajouter depuis un PDF ouvert" }).click();
  await page.getByRole("button", { name: "Tout ajouter" }).click();
  await expect(organizedPages(page)).toHaveCount(6);

  const externalPage = organizedPages(page).filter({ hasText: "pdf-small-1-page.pdf" });
  for (let index = 0; index < 5; index += 1) {
    await externalPage.getByTitle("Déplacer d'un cran vers la gauche").click();
  }
  await expect(organizedPages(page).first()).toHaveAttribute("data-source-page-index", "0");
  await page.getByLabel("Nom du PDF exporté").fill("qa-export-multi.pdf");

  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-multi-document", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-export-multi.pdf");
  await download.saveAs(outputPath);
  const exported = validatePdf(outputPath, 6);
  expect(exported.pages.map((item) => item.width)).toEqual([320, 300, 325, 350, 375, 400]);

  await expect(page.getByText(/PDF exporté avec succès/)).toBeVisible();
  await expect(page.locator(".document-item")).toHaveCount(3);
  await page.getByRole("button", { name: "pdf-small-1-page.pdf", exact: true }).click();
  await expect(page.locator(".pdf-page")).toHaveCount(1);
  await page.getByRole("button", { name: "pdf-small-5-pages.pdf", exact: true }).click();
  await expect(page.locator(".pdf-page")).toHaveCount(5);
});

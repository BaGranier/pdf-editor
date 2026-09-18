import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("FORMS-PRINT-REGRESSION-003 prépare une impression visible sans ouvrir d'onglet automatiquement", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Fichier" }).click();
  await page.getByRole("menuitem", { name: /Imprimer/ }).click();
  await expect(page.getByRole("dialog", { name: "Aperçu avant impression" })).toBeVisible();
  await expect(page.getByTitle("Aperçu du PDF à imprimer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ouvrir le PDF à imprimer" })).toBeEnabled();
  await expect(page.locator("iframe.pdf-print-frame")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "pdf-small-1-page.pdf, document actif" })).not.toHaveAccessibleDescription(
    "Modifications non sauvegardées.",
  );
});

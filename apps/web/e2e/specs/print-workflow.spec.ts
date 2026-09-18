import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("PRODUCT-EXPANSION-FIXES-002 prépare l'impression sans ouvrir d'onglet persistant", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Fichier" }).click();
  await page.getByRole("menuitem", { name: /Imprimer/ }).click();
  await expect(page.locator("iframe.pdf-print-frame")).toHaveCount(1);
  await expect(page.getByText("Document courant préparé pour l’impression.")).toBeVisible();
  await expect(page.getByRole("button", { name: "pdf-small-1-page.pdf, document actif" })).not.toHaveAccessibleDescription(
    "Modifications non sauvegardées.",
  );
});

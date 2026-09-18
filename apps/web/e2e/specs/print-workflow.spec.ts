import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("PRODUCT-EXPANSION-STABILITY-001 prépare l'impression depuis le PDF courant", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Fichier" }).click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("menuitem", { name: /Imprimer/ }).click();
  await popup;
  await expect(page.getByText("Document courant préparé pour l’impression.")).toBeVisible();
  await expect(page.getByRole("button", { name: "pdf-small-1-page.pdf, document actif" })).not.toHaveAccessibleDescription(
    "Modifications non sauvegardées.",
  );
});

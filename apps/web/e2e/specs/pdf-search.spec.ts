import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("PRODUCT-EXPANSION-STABILITY-001 recherche le texte PDF sans activer l'édition native", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.nativeText);

  await page.keyboard.press("Control+f");
  const query = page.getByRole("textbox", { name: "Rechercher dans le document" });
  await expect(query).toBeFocused();
  await query.fill("Montant");
  await expect(page.locator('[aria-label="Résultats de recherche"]')).toContainText("1 / 1");
  await expect(page.locator(".pdf-search-highlight")).toHaveCount(1);
  await expect(page.locator(".native-text-layer")).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(page.locator(".pdf-search-highlight.is-active")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("search", { name: "Rechercher dans le document" })).toBeHidden();
  await expect(page.locator(".pdf-search-highlight")).toHaveCount(0);
});

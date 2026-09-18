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

test("PRODUCT-EXPANSION-FIXES-002 aligne le surlignage sur la géométrie de la text layer", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.nativeText);
  await page.keyboard.press("Control+f");
  await page.getByRole("textbox", { name: "Rechercher dans le document" }).fill("Montant");
  const text = page.locator(".textLayer span").filter({ hasText: "Montant" }).first();
  const highlight = page.locator(".pdf-search-highlight.is-active");
  await expect(highlight).toHaveCount(1);
  const [textBox, highlightBox] = await Promise.all([text.boundingBox(), highlight.boundingBox()]);
  expect(textBox).not.toBeNull();
  expect(highlightBox).not.toBeNull();
  expect(Math.abs(highlightBox!.y - textBox!.y)).toBeLessThan(6);
  expect(highlightBox!.x).toBeGreaterThanOrEqual(textBox!.x - 6);
  expect(highlightBox!.x + highlightBox!.width).toBeLessThanOrEqual(textBox!.x + textBox!.width + 6);
});

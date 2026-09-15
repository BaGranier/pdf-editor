import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("EDITOR-UX-003 navigue depuis les miniatures et garde le header compact", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);

  const pageFive = page.getByRole("button", { name: "Aller à la page 5" });
  await pageFive.click();
  await expect(pageFive).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".pdf-page[data-page-number='5']")).toBeInViewport();

  await page.getByRole("button", { name: "Vue grille" }).click();
  const pageThree = page.getByRole("button", { name: "Aller à la page 3" });
  await pageThree.click();
  await expect(pageThree).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".pdf-page[data-page-number='3']")).toBeInViewport();

  const open = page.locator("button.toolbar-icon-button[aria-label='Ouvrir un PDF']");
  const save = page.getByRole("button", { name: "Enregistrer sous…" });
  const reset = page.getByRole("button", { name: "Réinitialiser les données locales" });
  const theme = page.getByRole("switch", { name: "Basculer le thème" });
  const [openBox, saveBox, resetBox, themeBox] = await Promise.all([open.boundingBox(), save.boundingBox(), reset.boundingBox(), theme.boundingBox()]);
  expect(openBox?.x).toBeLessThan(themeBox?.x ?? Infinity);
  expect(saveBox?.x).toBeLessThan(themeBox?.x ?? Infinity);
  expect(resetBox?.x).toBeLessThan(themeBox?.x ?? Infinity);
});

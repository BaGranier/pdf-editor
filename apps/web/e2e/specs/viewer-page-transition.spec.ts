import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("VIEWER-PAGE-TRANSITION-001 conserve un buffer visible et garde la scène présentation noire", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.mixed);
  const viewer = page.getByTestId("pdf-viewer");
  await page.getByLabel("Mode d'affichage").selectOption("single-page");
  await expect(viewer.locator(".pdf-page[data-page-buffer='front']")).toHaveAttribute("data-page-number", "1");

  await page.getByRole("button", { name: "Page suivante" }).click();
  await expect.poll(() => viewer.locator(".pdf-page").count()).toBeLessThanOrEqual(2);
  await expect(viewer.locator(".pdf-page[data-page-buffer='front']")).toHaveAttribute("data-page-number", "2");
  await expect(viewer.locator(".pdf-page")).toHaveCount(1);

  await page.getByLabel("Mode d'affichage").selectOption("presentation");
  await expect(viewer).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".pdf-page[data-page-buffer='front']")).toHaveAttribute("data-page-number", "4");
  await expect.poll(() => viewer.locator(".pdf-page").count()).toBeLessThanOrEqual(2);
  await expect(viewer.locator(".pdf-page")).toHaveCount(1);
});

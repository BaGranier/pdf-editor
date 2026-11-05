import { expect, test } from "../helpers/qa-test";
import { fixtureDirectory, fixtures, openApp, openPdf } from "../helpers/app";
import path from "node:path";

test("DESKTOP-005 menus remain inside wide, narrow and low viewports", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  const trigger = page.getByRole("button", { name: "Fichier", exact: true });
  const menu = page.getByRole("menu", { name: "Fichier" });
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 400, height: 500 }, { width: 600, height: 180 }]) {
    await page.setViewportSize(viewport);
    await trigger.evaluate((element) => element.removeAttribute("style"));
    await trigger.click();
    await expect(menu).toBeVisible();
    const normal = await menu.boundingBox();
    expect(normal!.x).toBeGreaterThanOrEqual(8);
    expect(normal!.x + normal!.width).toBeLessThanOrEqual(viewport.width - 8);
    expect(normal!.y + normal!.height).toBeLessThanOrEqual(viewport.height - 8);
    await page.keyboard.press("Escape");
    // Exercise collision placement independently of the responsive toolbar layout.
    await trigger.evaluate((element) => { Object.assign(element.style, { position: "fixed", right: "8px", bottom: "8px", zIndex: "110" }); });
    // The artificial bottom anchor overlaps the footer's stacking context.
    await trigger.dispatchEvent("click");
    await expect(menu).toBeVisible();
    await expect.poll(async () => {
      const box = await menu.boundingBox();
      return !!box && box.x >= 8 && box.y >= 8 && box.x + box.width <= viewport.width - 7 && box.y + box.height <= viewport.height - 7;
    }).toBe(true);
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem").last()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem").nth(await menu.getByRole("menuitem").count() - 2)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await trigger.dispatchEvent("click");
  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();
});

for (const dpr of [1, 1.25, 2]) {
  test.describe(`DESKTOP-005 render DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("rerenders dense bitmaps across zoom, modes, fit and resize", async ({ page }) => {
      await openApp(page);
      await openPdf(page, path.join(fixtureDirectory, "pdf-render-sharpness.pdf"));
      const viewer = page.getByTestId("pdf-viewer");
      const canvas = viewer.locator(".pdf-canvas").first();
      const assertBitmap = async () => {
        await expect.poll(() => canvas.evaluate((node) => {
          const bitmap = node as HTMLCanvasElement;
          const zoom = Number(bitmap.dataset.renderZoom);
          const ratio = Number(bitmap.dataset.renderPixelRatio);
          const expected = Math.max(window.devicePixelRatio, Math.min(2, 1 / zoom));
          const bounds = bitmap.getBoundingClientRect();
          return bounds.width > 0 && Math.abs(ratio - expected) < 0.001 &&
            Math.abs(bitmap.width - bounds.width * expected) <= 2 &&
            Math.abs(bitmap.height - bounds.height * expected) <= 2;
        })).toBe(true);
      };
      for (let index = 0; index < 5; index++) await page.getByRole("button", { name: "Réduire le zoom" }).click();
      await expect(page.getByTestId("zoom-level")).toHaveText("50%");
      await expect(canvas).toHaveAttribute("data-render-zoom", "0.5");
      await assertBitmap();
      for (let index = 0; index < 10; index++) await page.getByRole("button", { name: "Augmenter le zoom" }).click();
      await expect(canvas).toHaveAttribute("data-render-zoom", "1.5");
      await assertBitmap();
      for (const mode of ["single-page", "presentation", "continuous"]) {
        await page.getByLabel("Mode d'affichage").selectOption(mode);
        await assertBitmap();
        await page.setViewportSize({ width: 1000, height: 700 });
        await assertBitmap();
        if (mode === "presentation") await page.keyboard.press("Escape");
      }
      await page.getByLabel("Mode d'affichage").selectOption("single-page");
      await page.getByRole("button", { name: "Ajuster à la page" }).click();
      await assertBitmap();
      const previous = await canvas.getAttribute("data-render-zoom");
      await page.setViewportSize({ width: 1200, height: 900 });
      await expect.poll(() => canvas.getAttribute("data-render-zoom")).not.toBe(previous);
      await assertBitmap();
      if (dpr === 1) {
        await page.evaluate(() => {
          Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1.25 });
          window.dispatchEvent(new Event("resize"));
        });
        await expect(canvas).toHaveAttribute("data-render-pixel-ratio", "1.25");
        await assertBitmap();
      }
    });
  });
}

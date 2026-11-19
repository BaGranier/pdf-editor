import { expect, test } from "../helpers/qa-test";
import { fixtures, getStoredDocuments, openApp, openPdf } from "../helpers/app";

test.use({ deviceScaleFactor: 2 });

test("sidebar SVG icons: marking, state, keyboard, themes and narrow HiDPI viewport", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  await expect(rail.locator('button > svg:not([data-icon="check"])')).toHaveCount(6);
  const documentEdits = async () => {
    const documents = await getStoredDocuments(page) as Array<{ fileName: string; edits?: unknown[]; editsDirty?: boolean }>;
    return documents.map(({ fileName, edits, editsDirty }) => ({ fileName, edits: edits ?? [], dirty: editsDirty ?? false }));
  };
  const before = JSON.stringify(await documentEdits());
  const marking = rail.getByRole("button", { name: "Marquage", exact: true });
  const menu = page.getByRole("region", { name: "Outils Marquage" });
  const assertVectors = async () => {
    const icons = page.locator(".tool-rail svg, .navigation-popover svg");
    expect(await icons.count()).toBeGreaterThanOrEqual(10);
    for (const svg of await icons.all()) {
      await expect(svg).toBeVisible();
      await expect(svg).toHaveAttribute("viewBox", "0 0 20 20");
      await expect(svg).toHaveAttribute("stroke", "currentColor");
      await expect(svg).toHaveAttribute("fill", "none");
      await expect(svg).toHaveAttribute("aria-hidden", "true");
      await expect(svg).toHaveAttribute("focusable", "false");
      const painted = await svg.evaluate((node) => {
        const style = getComputedStyle(node), button = node.closest("button")!;
        return { stroke: style.stroke, color: getComputedStyle(button).color, width: parseFloat(style.width), height: parseFloat(style.height) };
      });
      expect(painted.stroke).toBe(painted.color);
      expect(painted.width).toBe(painted.height);
      expect(painted.width).toBeGreaterThanOrEqual(12);
      expect(await svg.textContent()).toBe("");
    }
    expect(await page.locator(".tool-rail, .navigation-popover").allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/[\u2196\u2197\u25a4\u25a7\u2713\u270e]|\p{Extended_Pictographic}/u)]));
    await expect(page.locator(".tool-rail img, .navigation-popover img, .tool-rail svg image, .navigation-popover svg image")).toHaveCount(0);
  };
  await marking.focus(); await page.keyboard.press("Enter");
  await expect(marking).toHaveAttribute("aria-expanded", "true");
  for (const name of ["Biffer", "Filigrane", "Masquage visuel", "Tampon"]) await expect(menu.getByRole("button", { name, exact: true }).locator("svg").first()).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = "125%"; });
  await assertVectors();
  await menu.getByRole("button", { name: "Filigrane", exact: true }).hover();
  await page.screenshot({ path: info.outputPath("sidebar-svg-light.png") });
  await page.keyboard.press("Escape"); await expect(marking).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.zoom = "100%"; });
  expect(JSON.stringify(await documentEdits())).toBe(before);
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
  await marking.click(); await menu.getByRole("button", { name: "Filigrane", exact: true }).click();
  await expect(page.getByLabel("Créer un filigrane")).toBeVisible();
  await expect(marking).toHaveAttribute("aria-pressed", "true");
  await expect(marking.locator('svg[data-icon="check"]')).toBeVisible();
  await marking.click(); await expect(menu.getByRole("button", { name: "Filigrane", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(menu.getByRole("button", { name: "Filigrane", exact: true }).locator('svg[data-icon="check"]')).toBeVisible();
  await menu.getByRole("button", { name: "Biffer", exact: true }).click();
  await expect(page.getByLabel("Créer un filigrane")).toBeHidden();
  await expect(page.getByLabel("Couche d'édition de la page 1", { exact: true })).toHaveAttribute("data-active-editing-tool", "redaction");
  await page.getByRole("switch", { name: "Basculer le thème" }).click();
  await page.setViewportSize({ width: 760, height: 600 });
  await marking.click(); await assertVectors();
  await expect(menu.getByRole("button", { name: "Biffer", exact: true })).toHaveAttribute("aria-pressed", "true");
  const bounds = await menu.boundingBox(); expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 760 && bounds.y >= 0 && bounds.y + bounds.height <= 600).toBeTruthy();
  await page.screenshot({ path: info.outputPath("sidebar-svg-dark-narrow-hidpi.png") });
  await page.keyboard.press("Escape"); await expect(marking).toBeFocused();
  expect(JSON.stringify(await documentEdits())).toBe(before);
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
});

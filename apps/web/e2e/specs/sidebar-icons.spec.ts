import { changeInterfaceTheme } from "../helpers/app";
import { expect, test } from "../helpers/qa-test";
import { fixtures, getStoredDocuments, openApp, openPdf } from "../helpers/app";

test.use({ deviceScaleFactor: 2 });

test("sidebar SVG icons: marking, state, keyboard, themes and narrow HiDPI viewport", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  await expect(rail.locator('button > svg:not([data-icon="check"])')).toHaveCount(7);
  const documentEdits = async () => {
    const documents = await getStoredDocuments(page) as Array<{ fileName: string; edits?: unknown[]; editsDirty?: boolean }>;
    return documents.map(({ fileName, edits, editsDirty }) => ({ fileName, edits: edits ?? [], dirty: editsDirty ?? false }));
  };
  const before = JSON.stringify(await documentEdits());
  const marking = rail.getByRole("button", { name: "Biffage et tampons", exact: true });
  const menu = page.getByRole("region", { name: "Outils Biffage et tampons" });
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
  await changeInterfaceTheme(page, "dark");
  await page.setViewportSize({ width: 760, height: 600 });
  await marking.click(); await assertVectors();
  await expect(menu.getByRole("button", { name: "Biffer", exact: true })).toHaveAttribute("aria-pressed", "true");
  const bounds = await menu.boundingBox(); expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 760 && bounds.y >= 0 && bounds.y + bounds.height <= 600).toBeTruthy();
  await page.screenshot({ path: info.outputPath("sidebar-svg-dark-narrow-hidpi.png") });
  await page.keyboard.press("Escape"); await expect(marking).toBeFocused();
  expect(JSON.stringify(await documentEdits())).toBe(before);
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
});

test("parcourt les sept catégories et leurs sous-outils sans édition implicite", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  const categories: [string, string[]][] = [
    ["Texte", ["Ajouter du texte", "Modifier le texte existant", "Lien"]],
    ["Formes et images", ["Image", "Dessiner", "Rectangle", "Carré", "Ellipse", "Cercle", "Ligne", "Flèche"]],
    ["Biffage et tampons", ["Biffer", "Masquage visuel", "Filigrane", "Tampon"]],
    ["Signature", ["Ajouter une signature"]],
    ["Pages", ["Afficher les miniatures", "Organiser"]],
    ["Conversion", ["OCR", "Convertir", "Nouveau PDF à partir d’images"]],
    ["Annotations", ["Commentaire", "Afficher les commentaires"]],
  ];
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  await expect(rail.getByRole("button")).toHaveText(categories.map(() => ""));
  await expect(rail.locator("button")).toHaveCount(categories.length);
  for (const [index, [label, tools]] of categories.entries()) {
    const category = rail.locator("button").nth(index);
    await expect(category).toHaveAccessibleName(label);
    await category.press("Space");
    const menu = page.getByRole("region", { name: `Outils ${label}`, exact: true });
    await expect(menu.getByRole("button")).toHaveCount(tools.length);
    for (const [toolIndex, name] of tools.entries()) {
      await expect(menu.getByRole("button").nth(toolIndex)).toHaveAccessibleName(name);
    }
    await page.keyboard.press("Escape");
    await expect(category).toBeFocused();
  }

  await rail.getByRole("button", { name: "Biffage et tampons" }).click();
  await page.getByRole("button", { name: "Filigrane", exact: true }).click();
  await expect(page.getByLabel("Créer un filigrane")).toBeVisible();
  await expect(rail.getByRole("button", { name: "Biffage et tampons" })).toHaveAttribute("aria-pressed", "true");
  await rail.getByRole("button", { name: "Signature" }).click();
  await expect(page.getByLabel("Créer un filigrane")).toBeVisible();
  await page.getByRole("button", { name: "Ajouter une signature", exact: true }).click();
  const signature = page.getByRole("dialog", { name: "Ajouter une signature" });
  await expect(signature).toBeVisible();
  await signature.getByRole("button", { name: "Annuler", exact: true }).click();
  await rail.getByRole("button", { name: "Pages" }).click();
  await page.getByRole("button", { name: "Organiser", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Organiser les pages", exact: true })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Pages" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
  await expect(page.getByTitle("Modifications non sauvegardées")).toHaveCount(0);
});

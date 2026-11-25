import { changeInterfaceTheme } from "../helpers/app";
import type { Locator } from "@playwright/test";
import { chooseNavigationTool, drawTextBox, fixtures, openApp, openPdf } from "../helpers/app";
import { expect, test } from "../helpers/qa-test";

async function withinViewport(overlay: Locator) {
  await expect(overlay).toBeVisible();
  await expect.poll(() => overlay.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const viewport = window.visualViewport!;
    return bounds.left >= viewport.offsetLeft + 7 && bounds.top >= viewport.offsetTop + 7 &&
      bounds.right <= viewport.offsetLeft + viewport.width - 7 &&
      bounds.bottom <= viewport.offsetTop + viewport.height - 7 &&
      node.scrollWidth <= node.clientWidth + 1;
  })).toBe(true);
}

async function expectPointerAccess(button: Locator) {
  await button.scrollIntoViewIfNeeded();
  await expect.poll(() => button.evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(x + width / 2, y + height / 2));
  })).toBe(true);
}

test("Fichier et export restent accessibles près des bords, après resize et zoom CSS", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await chooseNavigationTool(page, "Ajouter du texte");
  const file = page.getByRole("button", { name: "Fichier", exact: true });
  const menu = page.getByRole("menu", { name: "Fichier", exact: true });
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const printing = menu.getByRole("menuitem", { name: /Imprimer/ });
  const viewport = page.locator("html");

  for (const [width, height, zoom, theme] of [
    [1440, 900, 1, "light"], [760, 460, 1.25, "dark"],
    [440, 280, 1.5, "ocean"], [390, 230, 2, "sand"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await viewport.evaluate((root, value) => { root.style.zoom = String(value); }, zoom);
    await changeInterfaceTheme(page, theme);
    await file.press("ArrowDown");
    await withinViewport(menu);
    await page.keyboard.press("End");
    await expect(printing).toBeFocused();
    await expectPointerAccess(printing);
    await expect.poll(() => viewport.evaluate((root) => root.scrollWidth <= root.clientWidth + 1)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(file).toBeFocused();
    await expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
    await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
  }

  await viewport.evaluate((root) => { root.style.zoom = "1"; });
  await page.setViewportSize({ width: 440, height: 290 });
  await file.click();
  await page.setViewportSize({ width: 365, height: 245 });
  await withinViewport(menu);
  const exportItem = menu.getByRole("menuitem", { name: "Exporter / Finaliser…" });
  await expectPointerAccess(exportItem);
  await exportItem.click();
  const dialog = page.getByRole("dialog", { name: "Exporter / Finaliser" });
  await withinViewport(dialog);
  await expect(menu).toHaveCount(0);
  await expect(dialog.getByRole("combobox", { name: "Profil de compression" })).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await file.click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).focus();
  await expect(menu).toHaveCount(0);
  await expect(page.getByTitle("Modifications non sauvegardées")).toHaveCount(0);
});

test("la dernière catégorie et son infobulle suivent le rail défilant", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  await page.setViewportSize({ width: 400, height: 260 });
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  const annotations = rail.getByRole("button", { name: "Annotations" });
  await annotations.scrollIntoViewIfNeeded();
  expect(await rail.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await annotations.hover();
  const tooltip = page.getByRole("tooltip");
  await withinViewport(tooltip);
  await expect(tooltip).toHaveText("Annotations");
  await annotations.click();
  const tools = page.getByRole("region", { name: "Outils Annotations" });
  await withinViewport(tools);
  const comments = tools.getByRole("button", { name: "Afficher les commentaires" });
  await expectPointerAccess(comments);
  await comments.click();
  await expect(tools).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Commentaires" })).toHaveAttribute("aria-selected", "true");
});

test("les contrôles du formulaire suivent la page et tombent sous la confirmation modale", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  await page.getByRole("button", { name: "Masquer la barre latérale" }).click();
  await page.getByRole("button", { name: "Masquer les propriétés" }).click();
  await page.setViewportSize({ width: 590, height: 360 });
  const lock = page.getByRole("button", { name: "Formulaire modifiable" });
  await lock.click();
  const options = page.getByRole("dialog", { name: "Mode d’édition du formulaire" });
  await withinViewport(options);
  const action = options.getByRole("button", { name: "Verrouiller le PDF pour l'export" });
  await expectPointerAccess(action);
  await page.keyboard.press("Escape");
  await expect(lock).toBeFocused();
  await expect(options).toHaveCount(0);
  await lock.click();
  await action.click();
  const confirmation = page.getByRole("dialog", { name: "Verrouiller le formulaire ?" });
  await withinViewport(confirmation);
  await expect(options).toHaveCount(0);
  await confirmation.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByTitle("Modifications non sauvegardées")).toHaveCount(0);
});

test("l’aide des polices et l’infobulle du texte dépassant sortent de leurs panneaux", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await chooseNavigationTool(page, "Ajouter du texte");
  await drawTextBox(page, { x: 70, y: 100 });
  const input = page.getByLabel("Texte ajouté page 1");
  await input.fill("Texte de contrôle très long. ".repeat(20));
  const overflow = page.locator(".pdf-text-edit__overflow-tooltip");
  await withinViewport(overflow);
  await expect(overflow).toContainText("Le texte dépasse");
  await page.setViewportSize({ width: 620, height: 285 });
  const help = page.getByRole("button", { name: "Comment ajouter une police personnalisée" });
  await help.click();
  const helpPanel = page.getByRole("dialog", { name: "Ajouter une police personnalisée" });
  await withinViewport(helpPanel);
  const details = helpPanel.getByText("Où trouver mes fichiers de police ?");
  await expectPointerAccess(details);
  await details.click();
  await withinViewport(helpPanel);
  await expect(helpPanel.getByText(/Library\/Fonts/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(helpPanel).toHaveCount(0);
  await expect(help).toBeFocused();
});

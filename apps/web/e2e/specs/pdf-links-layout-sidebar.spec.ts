import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import { chooseNavigationTool, fixtureDirectory, fixtures, openApp, openPdf } from "../helpers/app";
import { expect, test } from "../helpers/qa-test";

const linksFixture = path.join(fixtureDirectory, "pdf-links-layout.pdf");
const longFixture = path.join(fixtureDirectory, "pdf-multipage-250.pdf");
const status = (page: Page) => page.locator(".status-bar");
const mode = (page: Page) => page.getByLabel("Mode d'affichage");
const dirty = (page: Page) => page.locator(".document-tab__dirty");
const pdfPage = (page: Page, number: number) => page.locator(`.viewer .pdf-page[data-page-number="${number}"]`);
const selectPage = (page: Page, number: number) => page.getByRole("button", { name: `Aller à la page ${number}`, exact: true }).click();

async function drawLink(page: Page) {
  await expect(pdfPage(page, 1)).toHaveAttribute("data-render-state", "ready");
  const bounds = await pdfPage(page, 1).locator(".page-surface").boundingBox();
  if (!bounds) throw new Error("Surface PDF indisponible.");
  await page.mouse.move(bounds.x + bounds.width * .15, bounds.y + bounds.height * .55);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .55, bounds.y + bounds.height * .68, { steps: 5 });
  await page.mouse.up();
}

test("liens natifs, signets, édition non navigante et export relu", async ({ page }, info) => {
  await page.addInitScript(() => {
    const calls: string[][] = [];
    Object.assign(window, { pdfLinkCalls: calls });
    window.open = (...args) => { calls.push(args.map(String)); return null; };
  });
  const opens = () => page.evaluate(() => (window as Window & { pdfLinkCalls?: string[][] }).pdfLinkCalls);
  await openApp(page);
  await openPdf(page, linksFixture);
  await expect(pdfPage(page, 1).getByRole("link")).toHaveCount(3);
  expect(await opens()).toEqual([]);
  await pdfPage(page, 1).getByRole("link", { name: /page source 2/ }).click();
  await expect(status(page)).toContainText("Page 2 / 8");
  await expect.poll(async () => pdfPage(page, 2).locator(".page-surface").evaluate((surface) => {
    const viewport = surface.closest(".viewer")!.getBoundingClientRect();
    return viewport.top - surface.getBoundingClientRect().top;
  })).toBeGreaterThan(300);

  await selectPage(page, 1);
  await pdfPage(page, 1).getByRole("link", { name: /page source 4/ }).click();
  await expect(status(page)).toContainText("Page 4 / 8");
  await selectPage(page, 1);
  await page.getByText("Signets", { exact: true }).click();
  await page.getByLabel("Développer : Chapitre synthétique").press("Space");
  await page.getByRole("button", { name: "Sous-section synthétique" }).click();
  await expect(status(page)).toContainText("Page 4 / 8");
  await selectPage(page, 1);
  await pdfPage(page, 1).getByRole("link", { name: /example.invalid\/pdf-test/ }).press("Enter");
  expect(await opens()).toEqual([["https://example.invalid/pdf-test", "_blank", "noopener,noreferrer"]]);
  await expect(dirty(page)).toHaveCount(0);

  await chooseNavigationTool(page, "Lien");
  await expect(pdfPage(page, 1).getByRole("button", { name: /Édition indisponible/ })).toHaveCount(5);
  await pdfPage(page, 1).getByRole("button", { name: /Modifier le lien.*example.invalid/ }).click();
  expect(await opens()).toHaveLength(1);
  await page.getByLabel("URL web", { exact: true }).fill("https://example.invalid/edited");
  await page.getByRole("button", { name: "Enregistrer le lien" }).click();
  await expect(dirty(page)).toHaveCount(1);
  await drawLink(page);
  await page.getByLabel("Type de lien").selectOption("internal");
  await page.getByLabel("Page source cible").fill("6");
  await page.getByLabel("Intitulé facultatif").fill("Aller à la section six");
  await page.getByRole("button", { name: "Enregistrer le lien" }).click();
  const added = pdfPage(page, 1).getByRole("button", { name: /Modifier le lien.*section six/ });
  await expect(added).toBeVisible();
  await added.click();
  await page.getByRole("button", { name: "Supprimer le lien" }).click();
  await expect(added).toHaveCount(0);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(added).toBeVisible();

  await page.getByRole("button", { name: "Sélection", exact: true }).click();
  const heading = pdfPage(page, 1).locator(".pdf-text-layer").getByText("Section 1", { exact: true });
  await heading.evaluate((text) => {
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    text.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Ajouter un lien à la sélection" }).click();
  await page.getByLabel("URL web", { exact: true }).fill("https://example.invalid/selection");
  await page.getByLabel("Intitulé facultatif").fill("Lien sur texte");
  await page.getByRole("button", { name: "Enregistrer le lien" }).click();

  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter / Finaliser…" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const output = info.outputPath("liens-exportes.pdf");
  await (await download).saveAs(output);
  await openPdf(page, output);
  await expect(pdfPage(page, 1).getByRole("link", { name: "Lien sur texte (lien externe)" })).toBeVisible();
  await pdfPage(page, 1).getByRole("link", { name: "Aller à la section six" }).click();
  await expect(status(page)).toContainText("Page 6 / 8");
  await expect(pdfPage(page, 6)).toBeInViewport();
});

async function firstRow(page: Page) {
  return page.locator(".viewer .pdf-page").evaluateAll((pages) => {
    const firstTop = pages[0]?.getBoundingClientRect().top;
    return pages.filter((article) => Math.abs(article.getBoundingClientRect().top - firstTop) < 1).length;
  });
}

test("rangées adaptatives, page courante et rendu partiel sur 250 pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await openPdf(page, linksFixture);
  await mode(page).selectOption("facing");
  await expect.poll(() => firstRow(page)).toBe(2);
  await expect(pdfPage(page, 2)).toBeInViewport();
  await mode(page).selectOption("adaptive");
  const minus = page.getByRole("button", { name: "Réduire le zoom" });
  const plus = page.getByRole("button", { name: "Augmenter le zoom" });
  while (await minus.isEnabled()) await minus.click();
  await expect.poll(() => firstRow(page)).toBeGreaterThanOrEqual(3);
  const columns = await firstRow(page);
  for (let index = 0; index < 8; index++) await plus.click();
  await expect.poll(() => firstRow(page)).toBeLessThan(columns);
  await selectPage(page, 6);
  await expect(pdfPage(page, 6)).toBeInViewport();
  await mode(page).selectOption("facing");
  await expect(status(page)).toContainText("Page 6 / 8");
  await expect(pdfPage(page, 6)).toBeInViewport();
  await mode(page).selectOption("presentation");
  await expect(page.locator(".viewer--presentation")).toBeVisible();
  await expect(pdfPage(page, 6)).toHaveAttribute("data-render-state", "ready");
  await page.keyboard.press("Escape");
  await expect(mode(page)).toHaveValue("facing");
  await expect(status(page)).toContainText("Page 6 / 8");
  await selectPage(page, 1);
  await pdfPage(page, 1).getByRole("link", { name: /page source 2/ }).click();
  await expect(status(page)).toContainText("Page 2 / 8");
  await expect(dirty(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Organiser", exact: true }).click();
  await page.getByRole("button", { name: "Tourner la page 1 vers la droite", exact: true }).click();
  await page.getByRole("button", { name: "Revenir à la lecture" }).click();
  await selectPage(page, 1);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(pdfPage(page, 1)).toHaveAttribute("data-rotation", "90");
  const rotated = pdfPage(page, 1).getByRole("link", { name: /page source 2/ });
  await expect.poll(async () => {
    const bounds = await rotated.boundingBox();
    return Boolean(bounds && bounds.height > bounds.width * 3);
  }).toBe(true);
  await rotated.click();
  await expect(status(page)).toContainText("Page 2 / 8");

  await openPdf(page, fixtures.fivePages);
  await expect.poll(() => page.locator(".viewer .pdf-page").evaluateAll((pages) => {
    const rows = new Map<number, number>();
    for (const page of pages) {
      const top = Math.round(page.getBoundingClientRect().top);
      rows.set(top, (rows.get(top) ?? 0) + 1);
    }
    return Array.from(rows.values());
  })).toEqual([2, 2, 1]);
  await openPdf(page, longFixture);
  await mode(page).selectOption("adaptive");
  await expect(page.locator(".viewer .pdf-page")).toHaveCount(250);
  await expect.poll(() => page.locator(".viewer canvas").count()).toBeLessThan(45);
  await selectPage(page, 220);
  await expect(pdfPage(page, 220)).toHaveAttribute("data-render-state", "ready");
  await expect(pdfPage(page, 220)).toBeInViewport();
  await expect(status(page)).toContainText("Page 220 / 250");
  await mode(page).selectOption("single-page");
  await expect(pdfPage(page, 220)).toHaveAttribute("data-page-buffer", "front");
});

async function expectContained(element: Locator) {
  await expect(element).toBeVisible();
  await expect.poll(() => element.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return bounds.left >= 7 && bounds.top >= 7 &&
      bounds.right <= document.documentElement.clientWidth - 7 &&
      bounds.bottom <= document.documentElement.clientHeight - 7 &&
      node.scrollWidth <= node.clientWidth + 1;
  })).toBe(true);
}

test("infobulles et sous-menus contenus, SVG et navigation clavier", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  const editing = rail.getByRole("button", { name: "Édition" });
  const marking = rail.getByRole("button", { name: "Marquage" });
  const tooltip = page.getByRole("tooltip");
  for (const [width, height, theme] of [[1440, 900, "light"], [550, 430, "dark"], [345, 350, "light"]] as const) {
    await page.setViewportSize({ width, height });
    const themeToggle = page.getByRole("switch", { name: "Basculer le thème" });
    if (await themeToggle.getAttribute("aria-checked") !== String(theme === "dark")) await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await marking.hover();
    await expectContained(tooltip);
    await expect(tooltip).toHaveText("Marquage");
    await expect(tooltip).toHaveCSS("white-space", "nowrap");
    await page.keyboard.press("Escape");
    await expect(tooltip).toHaveCount(0);
    await page.mouse.move(width - 4, 4);
    await editing.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(editing).toBeFocused();
    await expectContained(tooltip);
    await page.keyboard.press("Enter");
    const panel = page.getByRole("region", { name: "Outils Édition" });
    await expect(editing).toHaveAttribute("aria-expanded", "true");
    await expectContained(panel);
    const long = panel.getByRole("button", { name: "Modifier le texte existant", exact: true });
    await expect(long.locator("span")).toHaveCSS("white-space", "nowrap");
    await expect(long.locator("span")).toHaveCSS("text-overflow", "ellipsis");
    await expect(long.locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(panel.locator("button > svg:not([data-icon=check])")).toHaveCount(await panel.getByRole("button").count());
    await page.keyboard.press("End");
    await expect(panel.getByRole("button", { name: "Flèche", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(editing).toBeFocused();
    await expect(editing).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 190, height: 330 });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  await editing.press("Space");
  const smallPanel = page.getByRole("region", { name: "Outils Édition" });
  await expectContained(smallPanel);
  const clipped = smallPanel.getByRole("button", { name: "Modifier le texte existant", exact: true });
  await expect.poll(() => clipped.locator("span").evaluate((label) => label.scrollWidth > label.clientWidth)).toBe(true);
  await clipped.hover();
  await expect(tooltip).toHaveText("Modifier le texte existant");
  await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBe(scrollWidth);
  await page.keyboard.press("Escape");
  await expect(smallPanel).toHaveCount(0);
  await expect(dirty(page)).toHaveCount(0);
  await expect(rail.getByRole("button", { name: "Sélection" })).toHaveAttribute("aria-pressed", "true");
});

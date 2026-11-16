import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "../helpers/qa-test";
import { chooseNavigationTool, enterOrganizeMode, fixtures, getStoredDocuments, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("sidebar groups: keyboard, single disclosure, clean navigation and narrow dark viewport", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  await page.setViewportSize({ width: 760, height: 600 });
  await page.getByRole("switch", { name: "Basculer le thème" }).click();
  const rail = page.getByRole("navigation", { name: "Outils d'édition" });
  await expect(rail.getByRole("button")).toHaveCount(6);
  const before = JSON.stringify(await getStoredDocuments(page));
  const layer = page.getByLabel("Couche d'édition de la page 1", { exact: true });
  const bounds = await layer.boundingBox();
  const marking = page.getByRole("button", { name: "Marquage", exact: true });
  await marking.focus(); await page.keyboard.press("Enter");
  await expect(marking).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Biffer", exact: true })).toBeFocused();
  await page.keyboard.press("Tab"); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Filigrane", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(marking).toBeFocused();
  expect(JSON.stringify(await getStoredDocuments(page))).toBe(before);
  await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
  expect(await layer.boundingBox()).toEqual(bounds);
  await marking.click(); await page.getByRole("button", { name: "Édition", exact: true }).click();
  await expect(marking).toHaveAttribute("aria-expanded", "false");
  const menu = page.getByRole("region", { name: "Outils Édition" });
  const box = await menu.boundingBox(); expect(box && box.y >= 0 && box.y + box.height <= 600).toBeTruthy();
  expect(await menu.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.keyboard.press("End"); await expect(page.getByRole("button", { name: "Flèche", exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath("compact-menu-dark-narrow.png") });
  await page.mouse.click(740, 10); await expect(menu).toBeHidden();
  await chooseNavigationTool(page, "Filigrane"); await expect(marking).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Créer un filigrane")).toBeVisible();
  await page.getByLabel("Texte du filigrane", { exact: true }).fill("BROUILLON");
  await page.getByLabel("Texte du filigrane", { exact: true }).press("Escape");
  await expect(page.getByLabel("Créer un filigrane")).toBeVisible();
  await page.getByLabel("Texte du filigrane", { exact: true }).press("Control+f");
  await expect(page.getByLabel("Texte du filigrane", { exact: true })).toHaveValue("BROUILLON");
  await chooseNavigationTool(page, "Biffer");
  await expect(layer).toHaveAttribute("data-active-editing-tool", "redaction");
  await expect(page.getByLabel("Créer un filigrane")).toBeHidden();
  await marking.focus(); await page.keyboard.press("Control+f");
  await expect(page.getByRole("button", { name: "Fermer la recherche", exact: true })).toBeVisible();
  await chooseNavigationTool(page, "Ajouter du texte");
  await expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
  await expect(page.getByRole("button", { name: "Fermer la recherche", exact: true })).toBeHidden();
});

test("tiled watermark: mixed pages, live preview, history, persistence, zoom and vector export", async ({ page }, info) => {
  const synthetic = info.outputPath("synthetic-pattern.pdf");
  execFileSync("uv", ["run", "--project", "../../services/pdf-engine", "python", "-c", "import fitz,sys; d=fitz.open(); dims=[(595,842,0)]*4+[(842,595,0),(420,640,90)];\nfor i,(w,h,r) in enumerate(dims):\n p=d.new_page(width=w,height=h);p.insert_text((40,100),'PUBLIC_SOURCE_'+str(i+1));p.set_rotation(r)\nd.save(sys.argv[1])", synthetic], { env: { ...process.env, UV_CACHE_DIR: path.resolve("../../.uv-cache") } });
  await openApp(page); await openPdf(page, synthetic);
  await chooseNavigationTool(page, "Filigrane");
  await page.getByLabel("Mode du filigrane", { exact: true }).selectOption("tiled");
  await page.getByLabel("Texte du filigrane", { exact: true }).fill("Test");
  await page.getByLabel("Pages du filigrane", { exact: true }).selectOption("all");
  await page.getByLabel("Densité du filigrane", { exact: true }).selectOption("Discret");
  await expect(page.getByRole("button", { name: "Appliquer le filigrane", exact: true })).toBeEnabled();
  const mark = page.getByLabel("Filigrane page 1", { exact: true });
  expect(await mark.locator("text").count()).toBeGreaterThan(20);
  expect(JSON.stringify(await getStoredDocuments(page))).not.toContain('"watermarkMode":"tiled"');
  await page.getByRole("button", { name: "Appliquer le filigrane", exact: true }).click();
  await page.getByLabel("Opacité du filigrane", { exact: true }).press("ArrowRight");
  await expect(page.getByLabel("Opacité du filigrane", { exact: true })).toHaveValue("26");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Opacité du filigrane", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page))).toContain('"opacity":0.26');
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page)).match(/"watermarkMode":"tiled"/g)?.length).toBe(6);
  const frame = await mark.boundingBox();
  const glyph = await mark.locator("text").evaluateAll((nodes) => {
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      const svg = (node as SVGTextElement).ownerSVGElement!.getBoundingClientRect();
      if (box.x > svg.x + 40 && box.x + box.width < svg.x + svg.width - 40 && box.y > svg.y + 40 && box.y < Math.min(svg.y + svg.height - 40, window.innerHeight - 80)) return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    return null;
  });
  if (!glyph) throw new Error("No visible watermark text");
  await page.mouse.move(glyph.x, glyph.y); await page.mouse.down();
  await page.mouse.move(glyph.x + 20, glyph.y + 15, { steps: 5 }); await page.mouse.up();
  expect(await mark.boundingBox()).toEqual(frame);
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page))).toMatch(/"offsetXPt":(?!0[,}])/);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page))).toContain('"offsetXPt":0');
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  const positions = await mark.locator("text").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("x"), node.getAttribute("y")]));
  for (const [button, count] of [["Réduire le zoom", 5], ["Augmenter le zoom", 10]] as const) {
    for (let i = 0; i < count; i++) await page.getByRole("button", { name: button, exact: true }).click();
    expect(await mark.locator("text").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("x"), node.getAttribute("y")]))).toEqual(positions);
  }
  await page.reload(); await expect(mark).toBeVisible();
  expect(await mark.locator("text").count()).toBeGreaterThan(20);
  await page.getByRole("switch", { name: "Basculer le thème" }).click();
  await page.screenshot({ path: info.outputPath("tiled-preview-dark.png") });
  await chooseNavigationTool(page, "Biffer");
  const layer = await page.getByLabel("Couche d'édition de la page 1", { exact: true }).boundingBox();
  if (!layer) throw new Error("Missing layer");
  await page.mouse.move(layer.x + 25, layer.y + 200); await page.mouse.down();
  await page.mouse.move(layer.x + 100, layer.y + 230); await page.mouse.up();
  await expect(page.getByLabel("Biffage en attente page 1", { exact: true })).toHaveCount(1);
  await chooseNavigationTool(page, "Ajouter du texte");
  await expect(page.getByLabel("Couche d'édition de la page 1", { exact: true })).toHaveAttribute("data-active-editing-tool", "add_text");
  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("tiled-result.pdf");
  page.once("dialog", (dialog) => dialog.accept());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF", exact: true }).click();
  const output = info.outputPath("tiled-result.pdf"); await (await download).saveAs(output);
  const pdf = validatePdf(output, 6); expect(pdf.text).toContain("PUBLIC_SOURCE_6");
  expect(pdf.text.match(/Test/g)!.length).toBeGreaterThan(100);
  await expect(page.getByRole("button", { name: "tiled-result.pdf, document actif" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("tiled-export-reopened.png") });
});


test("sidebar groups: native text draft survives a blocked tool change", async ({ page }) => {
  await openApp(page); await openPdf(page, fixtures.nativeText);
  await chooseNavigationTool(page, "Modifier le texte existant");
  await page.getByRole("button", { name: /Modifier le texte « Montant total : 1 250 €/ }).dblclick();
  const editor = page.getByRole("textbox", { name: /Modifier le texte PDF/ });
  await editor.fill("Montant total : 1 375 €");
  await chooseNavigationTool(page, "Biffer");
  await expect(editor).toHaveValue("Montant total : 1 375 €");
  await expect(page.getByRole("alert")).toContainText("Validez ou annulez");
  await expect(page.getByLabel("Couche d'édition de la page 1", { exact: true })).toHaveAttribute("data-active-editing-tool", "edit_text");
  await editor.press("Control+Enter");
  await chooseNavigationTool(page, "Biffer");
  await expect(page.getByLabel("Couche d'édition de la page 1", { exact: true })).toHaveAttribute("data-active-editing-tool", "redaction");
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page))).toContain("Montant total : 1 375 €");
});

test.describe("high DPI", () => {
  test.use({ deviceScaleFactor: 2 });
  test("tiled watermark stays anchored at DPR 2 through resize", async ({ page }) => {
    await openApp(page); await openPdf(page, fixtures.onePage);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    await chooseNavigationTool(page, "Filigrane");
    await page.getByLabel("Mode du filigrane", { exact: true }).selectOption("tiled");
    await expect(page.getByRole("button", { name: "Appliquer le filigrane", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Appliquer le filigrane", exact: true }).click();
    const mark = page.getByLabel("Filigrane page 1", { exact: true });
    const positions = await mark.locator("text").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("x"), node.getAttribute("y")]));
    expect(positions.length).toBeGreaterThan(10);
    await page.setViewportSize({ width: 1100, height: 800 });
    expect(await mark.locator("text").evaluateAll((nodes) => nodes.map((node) => [node.getAttribute("x"), node.getAttribute("y")]))).toEqual(positions);
    const stored = JSON.stringify(await getStoredDocuments(page));
    expect(stored).not.toContain('"devicePixelRatio"');
  });
});

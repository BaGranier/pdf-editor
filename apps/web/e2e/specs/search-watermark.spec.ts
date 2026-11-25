import { changeInterfaceTheme } from "../helpers/app";
import { chooseNavigationTool } from "../helpers/app";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtureDirectory, getStoredDocuments, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

const fixture = path.join(fixtureDirectory, "redaction-stamps.pdf");

test("search redaction watermark: auto-fit stamp, verified search, linked pages and secure export", async ({ page }, testInfo) => {
  const original = readFileSync(fixture);
  await openApp(page);
  await openPdf(page, fixture);
  await chooseNavigationTool(page, "Tampon");
  await page.getByLabel("Tampon prédéfini").selectOption("REÇU");
  const layer = page.getByLabel("Couche d'édition de la page 1", { exact: true });
  await layer.click({ position: { x: 30, y: 250 } });
  const stamp = page.getByLabel("Tampon page 1", { exact: true });
  await expect(stamp).toBeVisible();
  const initialSize = Number.parseFloat(await page.getByLabel("Taille calculée du tampon", { exact: true }).innerText());
  const handle = await stamp.getByRole("button", { name: "Redimensionner la forme depuis se" }).boundingBox();
  if (!handle) throw new Error("Missing stamp handle");
  await page.mouse.move(handle.x + 2, handle.y + 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 92, handle.y + 32, { steps: 6 });
  await page.mouse.up();
  expect(Number.parseFloat(await page.getByLabel("Taille calculée du tampon", { exact: true }).innerText())).toBeGreaterThan(initialSize);
  await expect(stamp.locator(".pdf-stamp-content rect[fill-opacity='0.1']")).toHaveCount(1);

  await chooseNavigationTool(page, "Biffer");
  await page.getByRole("button", { name: "Rechercher et biffer…", exact: true }).click();
  await page.getByLabel("Terme à biffer", { exact: true }).fill("SECRET_TEST_12345");
  await expect(page.getByLabel("Compteur des occurrences")).toHaveText("2 occurrences · 0 sélectionnées");
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sélectionner toutes les occurrences", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Appliquer le biffage", exact: true }).click();
  await expect(page.getByText("2 nouvelles zones de biffage créées.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(1);

  await chooseNavigationTool(page, "Filigrane");
  await page.getByLabel("Pages du filigrane").selectOption("all");
  await page.getByRole("button", { name: "Prévisualiser le filigrane", exact: true }).click();
  await expect(page.getByLabel("Filigrane page 1", { exact: true })).toHaveCount(1);
  expect(JSON.stringify(await getStoredDocuments(page))).not.toContain('"purpose":"watermark"');
  await page.getByRole("button", { name: "Valider le filigrane", exact: true }).click();
  await page.getByLabel("Rotation du filigrane", { exact: true }).press("ArrowRight");
  await expect(page.getByLabel("Rotation du filigrane", { exact: true })).toHaveValue("-44");
  await page.getByLabel("Opacité du filigrane", { exact: true }).press("ArrowRight");
  await expect(page.getByLabel("Opacité du filigrane", { exact: true })).toHaveValue("26");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Opacité du filigrane", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page))).toContain('"opacity":0.26');
  await page.reload();
  await expect(page.getByLabel("Filigrane page 1", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Filigrane page 2", { exact: true })).toHaveCount(1);
  for (const [button, clicks] of [["Réduire le zoom", 5], ["Augmenter le zoom", 10], ["Réduire le zoom", 5]] as const) {
    for (let i = 0; i < clicks; i++) await page.getByRole("button", { name: button, exact: true }).click();
    const mark = await page.getByLabel("Filigrane page 1", { exact: true }).boundingBox();
    const surface = await page.getByLabel("Couche d'édition de la page 1", { exact: true }).boundingBox();
    expect(mark && surface && mark.width / surface.width).toBeCloseTo(1, 2);
  }
  await page.getByLabel("Mode d'affichage").selectOption("single-page");
  await expect(page.getByLabel("Filigrane page 1", { exact: true })).toBeVisible();
  await page.getByLabel("Mode d'affichage").selectOption("presentation");
  await expect(page.getByTestId("pdf-viewer")).toHaveClass(/viewer--presentation/);
  await expect(page.getByTestId("pdf-viewer")).toBeFocused();
  await expect(page.getByLabel("Filigrane page 1", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell--presentation/);
  await page.getByLabel("Mode d'affichage").selectOption("continuous");
  await changeInterfaceTheme(page, "dark");
  await page.screenshot({ path: testInfo.outputPath("pending-watermark-dark.png") });
  await changeInterfaceTheme(page, "light");
  await page.screenshot({ path: testInfo.outputPath("pending-watermark.png") });
  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("searched-watermark.pdf");
  page.once("dialog", (dialog) => dialog.accept());
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF", exact: true }).click();
  const output = testInfo.outputPath("searched-watermark.pdf");
  await (await download).saveAs(output);
  const pdf = validatePdf(output, 2);
  expect(pdf.text).not.toContain("SECRET_TEST_12345");
  expect(pdf.text).toContain("CONFIDENTIEL");
  expect(pdf.text).toContain("REÇU");
  expect(pdf.text).toContain("PUBLIC_NEIGHBOR_PAGE_1");
  execFileSync("uv", ["run", "--project", "../../services/pdf-engine", "python", "-c", "import fitz,sys; d=fitz.open(sys.argv[1]); assert all(d[i].get_pixmap().pixel(50,110)==(0,0,0) for i in range(2)); assert b'SECRET_TEST_12345' not in open(sys.argv[1],'rb').read()", output], { env: { ...process.env, UV_CACHE_DIR: path.resolve("../../.uv-cache") } });
  await expect(page.getByRole("button", { name: "searched-watermark.pdf, document actif" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("exported-watermark.png") });
  expect(readFileSync(fixture)).toEqual(original);
});

test("visual mask explicitly preserves recoverable source text", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixture);
  await chooseNavigationTool(page, "Masquage visuel");
  await expect(page.getByText(/Ce masque ne supprime pas les informations/)).toBeVisible();
  const bounds = await page.getByLabel("Couche d'édition de la page 1", { exact: true }).boundingBox();
  if (!bounds) throw new Error("Missing layer");
  await page.mouse.move(bounds.x + 30, bounds.y + 90);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + 140, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/Ce masque ne supprime pas les informations/)).toBeVisible();
  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("visual-mask.pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF", exact: true }).click();
  const output = testInfo.outputPath("visual-mask.pdf");
  await (await download).saveAs(output);
  expect(validatePdf(output, 2).text.match(/SECRET_TEST_12345/g)).toHaveLength(2);
});

test("stamp reference proportions: large REÇU, turquoise rotated REÇU and BROUILLON", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixture);
  for (const [index, text, y] of [[0, "REÇU", 40], [1, "REÇU", 170], [2, "BROUILLON", 290]] as const) {
    await chooseNavigationTool(page, "Tampon");
    await page.getByLabel("Tampon prédéfini").selectOption(text);
    await page.getByLabel("Couche d'édition de la page 1", { exact: true }).click({ position: { x: 40, y } });
    const mark = page.getByLabel("Tampon page 1", { exact: true }).nth(index);
    if (index === 0) {
      const handle = await mark.getByRole("button", { name: "Redimensionner la forme depuis se" }).boundingBox();
      if (!handle) throw new Error("Missing stamp handle");
      await page.mouse.move(handle.x + 2, handle.y + 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + 92, handle.y + 22, { steps: 5 });
      await page.mouse.up();
    }
    if (index === 1) {
      await page.getByRole("button", { name: "Couleur du tampon", exact: true }).click();
      await page.getByRole("button", { name: "Couleur #0d9488", exact: true }).click();
      for (let i = 0; i < 15; i++) await page.getByLabel("Rotation du tampon", { exact: true }).press("ArrowLeft");
    }
    await expect(mark.locator(".pdf-stamp-content rect[fill-opacity='0.1']")).toHaveCount(1);
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath("three-reference-stamps.png") });
  await page.setViewportSize({ width: 760, height: 920 });
  await expect(page.getByRole("button", { name: "Biffage et tampons", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("reference-narrow.png") });
});

test("watermark 250 pages applies one editable group and exports all pages", async ({ page, qa }, testInfo) => {
  test.slow();
  const synthetic = testInfo.outputPath("watermark-250.pdf");
  execFileSync("uv", ["run", "--project", "../../services/pdf-engine", "python", "-c", "import fitz,sys; d=fitz.open(); [d.new_page(width=400,height=600).insert_text((40,100),'PUBLIC_PAGE_'+str(i+1)) for i in range(250)]; d.save(sys.argv[1],garbage=4,deflate=True)", synthetic], { env: { ...process.env, UV_CACHE_DIR: path.resolve("../../.uv-cache") } });
  await openApp(page);
  await qa.measure("open-250-watermark-pages", () => openPdf(page, synthetic));
  await chooseNavigationTool(page, "Filigrane");
  await expect(page.getByLabel("Pages du filigrane")).toHaveValue("all");
  await qa.measure("preview-250-watermarks", async () => {
    await expect(page.getByRole("button", { name: "Valider le filigrane", exact: true })).toBeEnabled();
  });
  await page.getByRole("button", { name: "Valider le filigrane", exact: true }).click();
  await expect.poll(async () => JSON.stringify(await getStoredDocuments(page)).match(/"purpose":"watermark"/g)?.length).toBe(250);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByLabel("Filigrane page 1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("watermarked-250.pdf");
  const download = page.waitForEvent("download");
  await qa.measure("export-250-watermarks", () => page.getByRole("button", { name: "Exporter le PDF", exact: true }).click());
  const output = testInfo.outputPath("watermarked-250.pdf");
  await (await download).saveAs(output);
  const checked = validatePdf(output, 250);
  expect(checked.text.match(/CONFIDENTIEL/g)).toHaveLength(250);
  expect(checked.text).toContain("PUBLIC_PAGE_250");
});

test("sélection directe et commentaire ancré, puis biffage du texte ajouté sans sauvegarde intermédiaire", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixture);
  const layer = page.getByLabel("Couche d'édition de la page 1", { exact: true });
  const surface = page.locator(".pdf-text-layer").first();
  const word = surface.locator("span").filter({ hasText: "PUBLIC_NEIGHBOR_PAGE_1" }).last();
  await word.evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    span.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Commentaire", exact: true }).click();
  await page.getByLabel("Texte du commentaire").fill("Note ancrée au texte public");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(page.locator(".pdf-comment-marker--anchored")).toHaveCount(1);
  await expect(page.locator(".properties-panel").getByRole("region", {name: "Propriétés du commentaire"})).toBeVisible();

  await chooseNavigationTool(page, "Biffer");
  await page.getByRole("button", { name: "Sélectionner le texte à biffer" }).click();
  const selection = page.getByLabel("Sélection du texte à biffer").first();
  await expect(selection).toBeVisible();
  const bounds = await selection.boundingBox();
  if (!bounds) throw new Error("Missing selection layer");
  const scale = bounds.width / 400;
  await page.mouse.move(bounds.x + 41 * scale, bounds.y + 107 * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 154 * scale, bounds.y + 107 * scale, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Biffage", exact: true }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Biffage page 2", { exact: true })).toHaveCount(0);

  await chooseNavigationTool(page, "Ajouter du texte");
  await expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
  const editBounds = await layer.boundingBox();
  if (!editBounds) throw new Error("Missing edit layer");
  await page.mouse.move(editBounds.x + 35, editBounds.y + 285);
  await page.mouse.down();
  await page.mouse.move(editBounds.x + 270, editBounds.y + 345, { steps: 6 });
  await page.mouse.up();
  const input = page.getByLabel("Texte ajouté page 1");
  await input.fill("Avant PRIVÉ Après");
  await input.blur();
  await chooseNavigationTool(page, "Biffer");
  await page.getByRole("button", { name: "Rechercher et biffer…" }).click();
  await page.getByLabel("Terme à biffer").fill("PRIVÉ");
  await expect(page.getByLabel("Compteur des occurrences")).toHaveText("1 occurrences · 0 sélectionnées");
  await page.getByText("Occurrences détectées (1)").click();
  await page.getByRole("button", { name: "Biffer cette occurrence 1" }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(2);

  await enterOrganizeMode(page);
  const download = page.waitForEvent("download");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Exporter le PDF", exact: true }).click();
  const output = testInfo.outputPath("direct-redaction.pdf");
  await (await download).saveAs(output);
  const checked = validatePdf(output, 2);
  expect(checked.text.match(/SECRET_TEST_12345/g)).toHaveLength(1);
  expect(checked.text).toContain("Avant");
  expect(checked.text).toContain("Après");
  expect(checked.text).not.toContain("PRIVÉ");
});

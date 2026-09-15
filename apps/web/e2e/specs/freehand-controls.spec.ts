import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";

test("EDIT-CONTROLS-001 règle l’épaisseur et l’opacité d’un dessin libre", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Dessiner" }).click();
  const width = page.getByLabel("Épaisseur du dessin");
  const opacity = page.getByLabel("Opacité du dessin");
  await width.press("Home");
  for (let step = 0; step < 5; step += 1) {
    await width.press("ArrowRight");
  }
  await opacity.press("Home");
  for (let step = 0; step < 50; step += 1) {
    await opacity.press("ArrowRight");
  }
  await expect(page.getByLabel("Aperçu du dessin à 50 % d’opacité")).toBeVisible();

  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) {
    throw new Error("La couche de dessin n’est pas mesurable.");
  }

  await page.mouse.move(box.x + 70, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 150, { steps: 5 });
  await page.mouse.up();

  const drawing = page.getByLabel("Dessin libre page 1");
  await expect(drawing).toBeVisible();

  await expect(width).toHaveValue("6");
  await expect(opacity).toHaveValue("50");
  await expect(page.getByLabel("Aperçu du dessin à 50 % d’opacité")).toBeVisible();

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("dessin-opaque.pdf");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF" }).click();
  await downloadPromise;
});

test("EDITOR-UX-003 sélectionne, déplace et restaure un dessin libre", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await page.getByRole("button", { name: "Dessiner" }).click();
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) throw new Error("La couche de dessin n’est pas mesurable.");

  await page.mouse.move(box.x + 70, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 170, box.y + 150, { steps: 5 });
  await page.mouse.up();
  const drawing = page.getByLabel("Dessin libre page 1");
  const path = drawing.locator("path").first();
  const before = await path.getAttribute("d");

  await page.getByRole("button", { name: "Sélection" }).click();
  await page.mouse.move(box.x + 120, box.y + 125);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 155, { steps: 4 });
  await page.mouse.up();
  await expect(drawing).toHaveClass(/is-selected/);
  await expect(path).not.toHaveAttribute("d", before ?? "");
  const moved = await path.getAttribute("d");

  await page.keyboard.press("Control+z");
  await expect(path).toHaveAttribute("d", before ?? "");
  await page.keyboard.press("Control+y");
  await expect(path).toHaveAttribute("d", moved ?? "");

  await page.getByRole("button", { name: "Couleur du dessin" }).click();
  await expect(page.getByRole("dialog", { name: "Couleur du dessin palette" })).toBeVisible();
  await page.getByRole("button", { name: "Couleur #dc2626" }).click();
  await expect(page.getByRole("dialog", { name: "Couleur du dessin palette" })).toBeHidden();
  await expect(path).toHaveAttribute("stroke", "#dc2626");
  await expect(page.locator(".property-slider__preview > span").first()).toHaveCSS("background-color", "rgb(220, 38, 38)");
});

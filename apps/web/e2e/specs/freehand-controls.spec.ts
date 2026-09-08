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
  await drawing.click();

  await expect(width).toHaveValue("6");
  await expect(opacity).toHaveValue("50");
  await expect(page.getByLabel("Aperçu du dessin à 50 % d’opacité")).toBeVisible();

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("dessin-opaque.pdf");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF" }).click();
  await downloadPromise;
});

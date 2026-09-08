import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

type ShapeName = "Rectangle" | "Ellipse" | "Ligne";

async function selectShape(page: import("@playwright/test").Page, shape: ShapeName) {
  await page.getByRole("button", { name: "Formes" }).click();
  const picker = page.getByRole("menu", { name: "Formes" });
  await expect(picker).toBeVisible();
  await picker.getByRole("menuitem", { name: shape }).click();
}

async function dragInLayer(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) throw new Error("La couche d’édition est indisponible.");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 5 });
  await page.mouse.up();
}

test("EDITOR-STAB-001 crée des formes via le picker et exporte leur opacité", async ({ page, qa }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await selectShape(page, "Rectangle");
  await dragInLayer(page, { x: 55, y: 75 }, { x: 200, y: 160 });
  const rectangle = page.getByLabel("Rectangle page 1");
  await expect(rectangle).toBeVisible();

  const width = page.getByLabel("Épaisseur du contour");
  const opacity = page.getByLabel("Opacité de la forme");
  await width.press("Home");
  for (let step = 0; step < 5; step += 1) await width.press("ArrowRight");
  await opacity.press("Home");
  for (let step = 0; step < 50; step += 1) await opacity.press("ArrowRight");
  await expect(opacity).toHaveValue("50");
  await expect(page.getByLabel("Aperçu de la forme à 50 % d’opacité")).toBeVisible();

  await selectShape(page, "Ellipse");
  await dragInLayer(page, { x: 250, y: 95 }, { x: 375, y: 180 });
  await expect(page.getByLabel("Ellipse page 1")).toBeVisible();

  await selectShape(page, "Ligne");
  await dragInLayer(page, { x: 100, y: 240 }, { x: 320, y: 305 });
  const line = page.getByLabel("Ligne page 1");
  await expect(line).toBeVisible();
  await expect(page.getByLabel("Opacité de la forme")).toBeVisible();
  await expect(page.getByLabel("Remplissage transparent")).toHaveCount(0);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("formes-opaques.pdf");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/pdf/export/organize"));
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-shapes", () => page.getByRole("button", { name: "Exporter le PDF" }).click());
  expect((await responsePromise).status()).toBe(200);
  const outputPath = testInfo.outputPath("formes-opaques.pdf");
  await (await downloadPromise).saveAs(outputPath);
  expect(validatePdf(outputPath, 1).drawingCount).toBe(3);
});

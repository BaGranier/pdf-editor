import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function placeShape(
  page: import("@playwright/test").Page,
  toolName: string,
  position: { x: number; y: number },
) {
  await page.getByRole("button", { name: toolName }).click();
  await page.getByLabel("Couche d'édition de la page 1").click({ position });
}

test("EDIT-SHAPES-001 crée, édite, échantillonne et exporte les formes", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await placeShape(page, "Ajouter un rectangle", { x: 80, y: 100 });
  const rectangle = page.getByLabel("Rectangle page 1");
  await expect(rectangle).toBeVisible();
  const rectangleBeforeMove = await rectangle.boundingBox();
  expect(rectangleBeforeMove).not.toBeNull();

  await page.getByLabel("Couleur du contour").fill("#ff0000");
  await page.getByLabel("Épaisseur du contour").fill("4");
  await page.getByLabel("Remplissage transparent").uncheck();
  await page.getByLabel("Couleur de remplissage").fill("#00ff00");

  await page.getByRole("button", { name: "Pipette contour" }).click();
  await page.locator(".page-surface").click({ position: { x: 20, y: 20 } });
  await expect(page.getByLabel("Couleur du contour")).toHaveValue("#ffffff");
  await page.getByLabel("Couleur du contour").fill("#ff0000");

  await page.getByRole("button", { name: "Pipette remplissage" }).click();
  await page.locator(".page-surface").click({ position: { x: 20, y: 20 } });
  await expect(page.getByLabel("Couleur de remplissage")).toHaveValue("#ffffff");
  await page.getByLabel("Couleur de remplissage").fill("#00ff00");

  if (!rectangleBeforeMove) {
    throw new Error("Le rectangle n'a pas de géométrie visible.");
  }
  await rectangle.hover();
  await page.mouse.down();
  await page.mouse.move(
    rectangleBeforeMove.x + rectangleBeforeMove.width / 2 + 35,
    rectangleBeforeMove.y + rectangleBeforeMove.height / 2 + 25,
  );
  await page.mouse.up();
  const rectangleAfterMove = await rectangle.boundingBox();
  expect(rectangleAfterMove?.x).toBeGreaterThan(rectangleBeforeMove.x + 20);

  const resizeHandle = rectangle.getByRole("button", {
    name: "Redimensionner la forme depuis se",
  });
  const beforeResize = await rectangle.boundingBox();
  await resizeHandle.hover();
  await page.mouse.down();
  await page.mouse.move(
    (beforeResize?.x ?? 0) + (beforeResize?.width ?? 0) + 45,
    (beforeResize?.y ?? 0) + (beforeResize?.height ?? 0) + 30,
  );
  await page.mouse.up();
  expect((await rectangle.boundingBox())?.width).toBeGreaterThan(beforeResize?.width ?? 0);

  await placeShape(page, "Ajouter une ellipse", { x: 300, y: 120 });
  await expect(page.getByLabel("Ellipse page 1")).toBeVisible();
  await placeShape(page, "Ajouter une ligne", { x: 160, y: 320 });
  const line = page.getByLabel("Ligne page 1");
  await expect(line).toBeVisible();
  await expect(page.getByLabel("Couleur de remplissage")).toHaveCount(0);

  await placeShape(page, "Ajouter une ellipse", { x: 20, y: 350 });
  const ellipses = page.getByLabel("Ellipse page 1");
  await expect(ellipses).toHaveCount(2);
  await ellipses.last().focus();
  await page.keyboard.press("Delete");
  await expect(ellipses).toHaveCount(1);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("formes-exportees.pdf");
  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/pdf/export/organize"),
  );
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-shapes", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  expect((await responsePromise).status()).toBe(200);
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("formes-exportees.pdf");
  await download.saveAs(outputPath);
  expect(validatePdf(outputPath, 1).drawingCount).toBe(3);
  await expect(
    page.getByRole("region", { name: "Aperçu PDF formes-exportees.pdf" }),
  ).toBeVisible();
});

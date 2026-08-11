import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("EDIT-SIGN-001 @smoke dessine, place et exporte une signature visuelle", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Ajouter une signature" }).click();
  const drawingCanvas = page.getByLabel("Zone de dessin de la signature");
  const canvasBox = await drawingCanvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) {
    throw new Error("La zone de dessin de signature n'est pas mesurable.");
  }

  await page.mouse.move(canvasBox.x + 80, canvasBox.y + 60);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 250, canvasBox.y + 120, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Effacer et recommencer" }).click();
  await expect(
    page.getByRole("button", { name: "Valider la signature" }),
  ).toBeDisabled();

  await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 220, canvasBox.y + 55, { steps: 4 });
  await page.mouse.move(canvasBox.x + 350, canvasBox.y + 115, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Valider la signature" }).click();

  const signatureLayer = page.getByLabel("Couche d'édition de la page 1");
  await signatureLayer.click({ position: { x: 25, y: 120 } });
  const signature = page.locator(".pdf-signature-edit");
  await expect(signature).toBeVisible();
  const initialBox = await signature.boundingBox();
  expect(initialBox).not.toBeNull();
  if (!initialBox) {
    throw new Error("La signature placée n'est pas mesurable.");
  }

  await page.mouse.move(
    initialBox.x + initialBox.width / 2,
    initialBox.y + initialBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(initialBox.x + initialBox.width / 2 + 25, initialBox.y + 70, {
    steps: 4,
  });
  await page.mouse.up();
  const movedBox = await signature.boundingBox();
  expect(movedBox?.x).toBeGreaterThan(initialBox.x + 15);
  expect(movedBox?.y).toBeGreaterThan(initialBox.y + 20);

  const resizeHandle = page.getByRole("button", {
    name: "Redimensionner la signature page 1",
  });
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).not.toBeNull();
  if (!resizeBox || !movedBox) {
    throw new Error("La poignée de signature n'est pas mesurable.");
  }
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 85, resizeBox.y + 30, { steps: 4 });
  await page.mouse.up();
  const resizedBox = await signature.boundingBox();
  expect(resizedBox?.width).toBeGreaterThan(movedBox.width + 30);
  expect((resizedBox?.width ?? 0) / (resizedBox?.height ?? 1)).toBeCloseTo(3, 1);

  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("110%");
  const zoomedBox = await signature.boundingBox();
  expect(zoomedBox?.width).toBeGreaterThan(resizedBox?.width ?? 0);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-signature-visuelle.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-visual-signature", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-signature-visuelle.pdf");
  await download.saveAs(outputPath);

  const exported = validatePdf(outputPath, 1);
  expect(exported.imageCount).toBeGreaterThanOrEqual(1);
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(page.getByText(/PDF exporté avec succès/)).toBeVisible();
});

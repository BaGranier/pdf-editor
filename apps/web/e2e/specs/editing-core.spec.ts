import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("EDIT-CORE-001 @smoke exporte ensemble texte et signature", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "add_text");
  await editLayer.click({ position: { x: 55, y: 80 } });
  const textInput = page.getByLabel("Texte ajouté page 1");
  await textInput.fill("Texte et signature réunis");

  const dragHandle = page.getByRole("button", {
    name: "Déplacer le bloc de texte page 1",
  });
  const handleBox = await dragHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  if (!handleBox) {
    throw new Error("La poignée du texte n'est pas mesurable.");
  }
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 45, handleBox.y + 35, { steps: 4 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Ajouter une signature" }).click();
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "signature");
  const canvas = page.getByLabel("Zone de dessin de la signature");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) {
    throw new Error("La zone de signature n'est pas mesurable.");
  }
  await page.mouse.move(canvasBox.x + 90, canvasBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 220, canvasBox.y + 45, { steps: 4 });
  await page.mouse.move(canvasBox.x + 340, canvasBox.y + 105, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Valider la signature" }).click();
  await editLayer.click({ position: { x: 80, y: 145 } });
  await expect(page.locator(".pdf-signature-edit")).toBeVisible();
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "select");
  await expect(page.getByRole("button", { name: "Sélection" })).toHaveCount(0);

  const objects = editLayer.locator(".pdf-text-edit, .pdf-signature-edit");
  await expect(objects).toHaveCount(2);
  expect(await objects.nth(0).getAttribute("class")).toContain("pdf-text-edit");
  expect(await objects.nth(1).getAttribute("class")).toContain(
    "pdf-signature-edit",
  );

  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("110%");
  await expect(textInput).toHaveValue("Texte et signature réunis");
  await expect(page.locator(".pdf-signature-edit")).toBeVisible();

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-edition-combinee.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-combined-edits", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-edition-combinee.pdf");
  await download.saveAs(outputPath);

  const exported = validatePdf(outputPath, 1);
  expect(exported.text).toContain("Texte et signature réunis");
  expect(exported.imageCount).toBeGreaterThanOrEqual(1);
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(
    page.getByRole("button", {
      name: "qa-edition-combinee.pdf, document actif",
    }),
  ).toBeVisible();
});

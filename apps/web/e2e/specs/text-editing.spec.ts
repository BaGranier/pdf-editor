import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("EDIT-TEXT-001 @smoke ajoute, déplace et exporte du texte libre", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Texte" }).click();
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await expect(editLayer).toBeVisible();
  await editLayer.click({ position: { x: 80, y: 100 } });

  const textInput = page.getByLabel("Texte ajouté page 1");
  await textInput.fill("Été 2026 : 42,50 !");
  await page.getByLabel("Police du texte").selectOption("Times");
  await page.getByLabel("Taille du texte").fill("20");
  await page.getByLabel("Couleur du texte").fill("#c026d3");
  await page.getByRole("button", { name: "Gras" }).click();

  const block = page.locator(".pdf-text-edit");
  const beforeMove = await block.boundingBox();
  const dragHandle = page.getByRole("button", {
    name: "Déplacer le bloc de texte page 1",
  });
  const handleBox = await dragHandle.boundingBox();
  expect(beforeMove).not.toBeNull();
  expect(handleBox).not.toBeNull();
  if (!beforeMove || !handleBox) {
    throw new Error("Le bloc de texte n'est pas mesurable.");
  }
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 60, handleBox.y + 45, { steps: 4 });
  await page.mouse.up();
  const afterMove = await block.boundingBox();
  expect(afterMove?.x).toBeGreaterThan(beforeMove.x + 5);
  expect(afterMove?.y).toBeGreaterThan(beforeMove.y + 10);

  const beforeZoom = await block.boundingBox();
  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(page.getByTestId("zoom-level")).toHaveText("110%");
  await expect(textInput).toHaveValue("Été 2026 : 42,50 !");
  const afterZoom = await block.boundingBox();
  expect(afterZoom?.width).toBeGreaterThan(beforeZoom?.width ?? 0);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-texte-ajoute.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-added-text", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-texte-ajoute.pdf");
  await download.saveAs(outputPath);

  const exported = validatePdf(outputPath, 1);
  expect(exported.text).toContain("Été 2026 : 42,50 !");
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(page.getByText(/PDF exporté avec succès/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "qa-texte-ajoute.pdf, document actif",
    }),
  ).toBeVisible();
});

import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

test("EDIT-INTERACT-001 redimensionne, annule et copie un bloc texte", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  const text =
    "Ce texte suffisamment long doit revenir sur plusieurs lignes puis se replier quand la zone devient plus large.";
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await editLayer.click({ position: { x: 20, y: 100 } });
  const input = page.getByLabel("Texte ajouté page 1");
  await input.fill(text);
  await input.evaluate((element) => element.blur());

  const block = page.locator(".pdf-text-edit");
  const initialBox = await block.boundingBox();
  const initialScrollHeight = await input.evaluate(
    (element) => element.scrollHeight,
  );
  expect(initialBox).not.toBeNull();
  if (!initialBox) {
    throw new Error("Le bloc de texte n'est pas mesurable.");
  }

  const resize = page.getByRole("button", {
    name: "Redimensionner le bloc de texte depuis se",
  });
  const resizeBox = await resize.boundingBox();
  expect(resizeBox).not.toBeNull();
  if (!resizeBox) {
    throw new Error("La poignée de redimensionnement n'est pas mesurable.");
  }
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2,
    resizeBox.y + resizeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(resizeBox.x - 400, resizeBox.y - 200, { steps: 5 });
  await page.mouse.up();

  const smallBox = await block.boundingBox();
  const narrowScrollHeight = await input.evaluate((element) => element.scrollHeight);
  expect(smallBox?.width).toBeLessThan(12);
  expect(smallBox?.height).toBeCloseTo(18, 0);
  expect(narrowScrollHeight).toBeGreaterThan(initialScrollHeight);
  await expect(input).toHaveValue(text);

  await page.keyboard.press("Control+z");
  const undoneBox = await block.boundingBox();
  expect(undoneBox?.width).toBeCloseTo(initialBox.width, 0);
  await page.keyboard.press("Control+y");
  const redoneBox = await block.boundingBox();
  expect(redoneBox?.width).toBeCloseTo(smallBox?.width ?? 0, 0);
  expect(redoneBox?.height).toBeCloseTo(smallBox?.height ?? 0, 0);

  await input.fill("Q");
  await input.evaluate((element) => element.blur());
  await page.getByLabel("Taille du texte").fill("6");
  const finalResizeBox = await resize.boundingBox();
  expect(finalResizeBox).not.toBeNull();
  if (!finalResizeBox) {
    throw new Error("La poignée de la petite zone n'est pas mesurable.");
  }
  await page.mouse.move(
    finalResizeBox.x + finalResizeBox.width / 2,
    finalResizeBox.y + finalResizeBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    finalResizeBox.x + finalResizeBox.width / 2,
    finalResizeBox.y - 80,
    { steps: 3 },
  );
  await page.mouse.up();
  const exportableMinimumBox = await block.boundingBox();
  expect(exportableMinimumBox?.width).toBeLessThan(12);
  expect(exportableMinimumBox?.height).toBeCloseTo(9, 0);

  await page.getByRole("button", { name: "Déplacer le bloc de texte page 1" }).click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const blocks = page.locator(".pdf-text-edit");
  await expect(blocks).toHaveCount(2);
  const originalPosition = await blocks.first().boundingBox();
  const copiedPosition = await blocks.last().boundingBox();
  expect(copiedPosition?.x).toBeGreaterThanOrEqual(originalPosition?.x ?? 0);
  expect(copiedPosition?.y).toBeGreaterThan(originalPosition?.y ?? 0);
  expect(copiedPosition?.width).toBeCloseTo(exportableMinimumBox?.width ?? 0, 0);
  expect(copiedPosition?.height).toBeCloseTo(exportableMinimumBox?.height ?? 0, 0);
  await expect(page.getByLabel("Taille du texte")).toHaveValue("6");

  const copiedMoveHandle = page
    .getByRole("button", { name: "Déplacer le bloc de texte page 1" })
    .last();
  const copiedHandleBox = await copiedMoveHandle.boundingBox();
  expect(copiedHandleBox).not.toBeNull();
  if (!copiedHandleBox || !copiedPosition) {
    throw new Error("La copie n'est pas déplaçable.");
  }
  await page.mouse.move(copiedHandleBox.x + 8, copiedHandleBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(copiedHandleBox.x + 70, copiedHandleBox.y + 55, {
    steps: 4,
  });
  await page.mouse.up();
  const movedCopy = await blocks.last().boundingBox();
  expect(movedCopy?.y).toBeGreaterThan(copiedPosition.y + 25);
  await page.keyboard.press("Control+z");
  const restoredCopy = await blocks.last().boundingBox();
  expect(restoredCopy?.x).toBeCloseTo(copiedPosition.x, 0);
  expect(restoredCopy?.y).toBeCloseTo(copiedPosition.y, 0);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-edit-interactions.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-edit-interactions", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-edit-interactions.pdf");
  await download.saveAs(outputPath);

  const exported = validatePdf(outputPath, 1);
  expect(exported.text.match(/Q/g)).toHaveLength(2);
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(
    page.getByRole("region", { name: "Aperçu PDF qa-edit-interactions.pdf" }),
  ).toBeVisible();
});

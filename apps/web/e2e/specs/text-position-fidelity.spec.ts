import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

type PreviewMeasurement = {
  blockX: number;
  contentX: number;
  contentY: number;
  textWidth: number;
  paddingLeft: number;
  paddingTop: number;
  borderLeft: number;
  borderTop: number;
};

async function measurePreview(
  input: import("@playwright/test").Locator,
  zoom: number,
): Promise<PreviewMeasurement> {
  return input.evaluate((element, scale) => {
    const textarea = element as HTMLTextAreaElement;
    const block = textarea.closest<HTMLElement>(".pdf-text-edit");
    const surface = textarea.closest<HTMLElement>(".page-surface");
    if (!block || !surface) {
      throw new Error("La géométrie du bloc texte est indisponible.");
    }
    const blockRect = block.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const style = getComputedStyle(textarea);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Le contexte de mesure typographique est indisponible.");
    }
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    return {
      blockX: (blockRect.left - surfaceRect.left) / scale,
      contentX: (textareaRect.left - surfaceRect.left) / scale,
      contentY: (textareaRect.top - surfaceRect.top) / scale,
      textWidth: context.measureText(textarea.value).width / scale,
      paddingLeft: Number.parseFloat(style.paddingLeft),
      paddingTop: Number.parseFloat(style.paddingTop),
      borderLeft: Number.parseFloat(style.borderLeftWidth),
      borderTop: Number.parseFloat(style.borderTopWidth),
    };
  }, zoom);
}

test("EDIT-TEXT-FIDELITY-001 aligne l'origine preview avec l'export", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.textPosition);
  const text = "ABCDEFG";
  await openApp(page);
  await openPdf(
    page,
    fixtures.textPosition,
    "pdf-text-position.pdf",
  );

  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await editLayer.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: bounds.left + 100,
        clientY: bounds.top + 643,
      }),
    );
  });

  const input = page.getByLabel("Texte ajouté page 1");
  await input.fill(text);
  await input.evaluate((element) => element.blur());
  await page.getByLabel("Taille du texte").fill("12");

  const atOneHundred = await measurePreview(input, 1);
  expect(atOneHundred.blockX).toBeCloseTo(100, 2);
  expect(atOneHundred.contentX).toBeCloseTo(atOneHundred.blockX, 2);
  expect(Math.abs(atOneHundred.contentY - 643)).toBeLessThan(0.5);
  expect(atOneHundred).toMatchObject({
    paddingLeft: 0,
    paddingTop: 0,
    borderLeft: 0,
    borderTop: 0,
  });

  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Réduire le zoom" }).click();
  }
  await expect(page.getByTestId("zoom-level")).toHaveText("50%");
  const atFifty = await measurePreview(input, 0.5);
  expect(atFifty.contentX).toBeCloseTo(atOneHundred.contentX, 1);
  expect(atFifty.contentY).toBeCloseTo(atOneHundred.contentY, 1);

  for (let step = 0; step < 15; step += 1) {
    await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  }
  await expect(page.getByTestId("zoom-level")).toHaveText("200%");
  const atTwoHundred = await measurePreview(input, 2);
  expect(atTwoHundred.contentX).toBeCloseTo(100, 2);
  expect(atTwoHundred.contentY).toBeCloseTo(atOneHundred.contentY, 1);

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-text-position.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-text-position", () =>
    page.getByRole("button", { name: "Exporter le PDF" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-text-position.pdf");
  await download.saveAs(outputPath);

  const exported = validatePdf(outputPath, 1);
  const exportedSpan = exported.textSpans.find((span) => span.text === text);
  expect(exportedSpan).toBeDefined();
  if (!exportedSpan) {
    throw new Error("Le texte ajouté est absent du PDF exporté.");
  }
  expect(exportedSpan.page).toBe(1);
  expect(exportedSpan.bbox[0]).toBeCloseTo(atTwoHundred.contentX, 1);
  expect(exportedSpan.bbox[1]).toBeCloseTo(atTwoHundred.contentY, 1);
  expect(exportedSpan.bbox[2] - exportedSpan.bbox[0]).toBeCloseTo(
    atTwoHundred.textWidth,
    0,
  );
  expect(readFileSync(fixtures.textPosition)).toEqual(sourceBefore);
  await expect(
    page.getByRole("region", { name: "Aperçu PDF qa-text-position.pdf" }),
  ).toBeVisible();
});

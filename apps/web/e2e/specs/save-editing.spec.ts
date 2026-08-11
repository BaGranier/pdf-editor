import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function addDrawnSignature(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Ajouter une signature" }).click();
  const canvas = page.getByLabel("Zone de dessin de la signature");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  if (!canvasBox) {
    throw new Error("La zone de signature n'est pas mesurable.");
  }
  await page.mouse.move(canvasBox.x + 90, canvasBox.y + 85);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 225, canvasBox.y + 45, { steps: 4 });
  await page.mouse.move(canvasBox.x + 350, canvasBox.y + 105, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Valider la signature" }).click();
}

test("EDIT-SAVE-001 @smoke sauvegarde texte et signature puis nettoie l'état dirty", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const saveButton = page.getByRole("button", { name: "Enregistrer sous…" });
  const sourceDocument = page.locator(
    '.document-select[title="pdf-small-1-page.pdf"]',
  );
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  const toolbar = page.getByRole("region", { name: "Contrôles PDF" });
  const textTool = page.getByRole("button", { name: "Ajouter du texte" });
  const signatureTool = page.getByRole("button", {
    name: "Ajouter une signature",
  });
  await expect(saveButton).toBeDisabled();
  await expect(sourceDocument).not.toHaveAttribute("aria-describedby");
  await expect(toolbar.getByText("pdf-small-1-page.pdf")).toHaveCount(0);
  await expect(toolbar.getByText("1 page", { exact: true })).toHaveCount(0);
  await expect(sourceDocument).toContainText("pdf-small-1-page.pdf");
  await expect(sourceDocument).toContainText("1 page");
  await expect(page.getByRole("button", { name: "Sélection" })).toHaveCount(0);
  await expect(saveButton).toHaveAttribute(
    "title",
    "Enregistrer sous… (Ctrl+Shift+S)",
  );
  await expect(textTool).toHaveAttribute("title", "Ajouter du texte");
  await expect(signatureTool).toHaveAttribute("title", "Ajouter une signature");

  await textTool.click();
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "add_text");
  await page.keyboard.press("Escape");
  await expect(editLayer).toHaveAttribute("data-active-editing-tool", "select");
  await textTool.click();
  await editLayer.click({ position: { x: 55, y: 80 } });
  await page.getByLabel("Texte ajouté page 1").fill("Cycle sauvegarde PDF");
  await expect(sourceDocument).toHaveAttribute("aria-describedby", /document-dirty-/);
  await expect(saveButton).toBeEnabled();

  await editLayer.dispatchEvent("click");
  await addDrawnSignature(page);
  await editLayer.click({ position: { x: 85, y: 250 } });
  await expect(page.locator(".pdf-signature-edit")).toBeVisible();

  await saveButton.click();
  const saveAsDialog = page.getByRole("dialog", { name: "Enregistrer sous" });
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("save-combined-edits", () =>
    saveAsDialog.getByRole("button", { name: "Enregistrer" }).click(),
  );
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-save-editing.pdf");
  await download.saveAs(outputPath);

  const saved = validatePdf(outputPath, 1);
  expect(saved.text).toContain("Cycle sauvegarde PDF");
  expect(saved.imageCount).toBeGreaterThanOrEqual(1);
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(sourceDocument).not.toHaveAttribute("aria-describedby");
  await expect(
    page.getByRole("button", {
      name: "pdf-small-1-page-modifie.pdf, document actif",
    }),
  ).toBeVisible();
  await expect(saveButton).toBeDisabled();
  await expect(page.getByText(/PDF sauvegardé avec succès/)).toBeVisible();
});

test("EDIT-SAVE-001 Enregistrer sous choisit le nom et le conserve", async ({
  page,
  qa,
}, testInfo) => {
  const sourceBefore = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await editLayer.click({ position: { x: 55, y: 80 } });
  await page.getByLabel("Texte ajouté page 1").fill("Version client 2026");
  await editLayer.dispatchEvent("click");
  await addDrawnSignature(page);
  await editLayer.click({ position: { x: 85, y: 250 } });

  await page.keyboard.press("Control+S");
  const dialog = page.getByRole("dialog", { name: "Enregistrer sous" });
  const fileNameInput = dialog.getByLabel("Nom du fichier");
  await expect(fileNameInput).toHaveValue("pdf-small-1-page-modifie.pdf");
  await fileNameInput.fill("contrat-client-été-2026");

  const downloadPromise = page.waitForEvent("download");
  await qa.measure("save-as-combined-edits", () =>
    dialog.getByRole("button", { name: "Enregistrer" }).click(),
  );
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("contrat-client-été-2026.pdf");
  const outputPath = testInfo.outputPath("contrat-client-été-2026.pdf");
  await download.saveAs(outputPath);

  const saved = validatePdf(outputPath, 1);
  expect(saved.text).toContain("Version client 2026");
  expect(saved.imageCount).toBeGreaterThanOrEqual(1);
  expect(readFileSync(fixtures.onePage)).toEqual(sourceBefore);
  await expect(
    page.getByRole("button", {
      name: "contrat-client-été-2026.pdf, document actif",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer sous…" })).toBeDisabled();
});

test("EDIT-SAVE-001 annuler Enregistrer sous conserve nom, edits et dirty", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const sourceDocument = page.locator(
    '.document-select[title="pdf-small-1-page.pdf"]',
  );
  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await page
    .getByLabel("Couche d'édition de la page 1")
    .click({ position: { x: 55, y: 80 } });
  await page.getByLabel("Texte ajouté page 1").fill("Texte conservé");

  await page.keyboard.press("Control+Shift+S");
  const dialog = page.getByRole("dialog", { name: "Enregistrer sous" });
  await dialog.getByLabel("Nom du fichier").fill("nom-annule.pdf");
  await dialog.getByRole("button", { name: "Annuler" }).click();

  await expect(dialog).toBeHidden();
  await expect(sourceDocument).toHaveAttribute("aria-describedby", /document-dirty-/);
  await expect(page.getByLabel("Texte ajouté page 1")).toHaveValue("Texte conservé");
  await expect(
    page.getByRole("button", { name: "pdf-small-1-page.pdf, document actif" }),
  ).toBeVisible();
});

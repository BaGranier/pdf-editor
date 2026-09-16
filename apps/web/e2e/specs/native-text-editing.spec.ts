import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";
import path from "node:path";

test("EDIT-TEXT-NATIVE-001 modifie et exporte un texte PDF natif", async ({ page, qa }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.nativeText);

  await page.getByRole("button", { name: "Modifier le texte existant" }).click();
  const target = page.getByRole("button", { name: /Modifier le texte « Montant total : 1 250 €/ });
  await expect(target).toBeVisible();
  await target.dblclick();

  const editor = page.getByRole("textbox", { name: /Modifier le texte PDF/ });
  await expect(editor).toHaveValue("Montant total : 1 250 €");
  await editor.fill("Montant total : 1 375 €");
  await editor.press("Control+Enter");
  await page.getByLabel("Police du texte").selectOption({ label: "Inter" });
  await expect(page.locator(".native-text-preview")).toBeVisible();
  await expect(page.locator(".native-text-editor textarea")).toHaveValue("Montant total : 1 375 €");

  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("button", { name: /Modifier le texte « Montant total : 1 250 €/ })).toBeVisible();
  await page.getByRole("button", { name: "Rétablir" }).click();
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect(page.locator(".native-text-editor textarea")).toHaveValue("Montant total : 1 375 €");

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-texte-natif.pdf");
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-native-text", () => page.getByRole("button", { name: "Exporter le PDF" }).click());
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-texte-natif.pdf");
  await download.saveAs(outputPath);
  const exported = validatePdf(outputPath, 1);
  expect(exported.text).toContain("Montant total : 1 375 €");
  expect(exported.text).not.toContain("Montant total : 1 250 €");
});

test("EDIT-TEXT-NATIVE-001 exporte une police TTF personnalisée locale", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.nativeText);
  await page.getByRole("button", { name: "Modifier le texte existant" }).click();
  await page.getByRole("button", { name: /Modifier le texte « Montant total : 1 250 €/ }).dblclick();
  const editor = page.getByRole("textbox", { name: /Modifier le texte PDF/ });
  await editor.fill("Montant total : 1 375 EUR");
  await editor.press("Control+Enter");

  await page.getByLabel("Importer une police TTF ou OTF").setInputFiles(
    path.resolve(process.cwd(), "public/fonts/FiraMono-Regular.ttf"),
  );
  await expect(page.getByText("Police ajoutée à la bibliothèque locale.")).toBeVisible();
  await page.getByLabel("Police du texte").selectOption({ label: "FiraMono Regular" });

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("qa-texte-natif-custom-font.pdf");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF" }).click();
  const download = await downloadPromise;
  const outputPath = testInfo.outputPath("qa-texte-natif-custom-font.pdf");
  await download.saveAs(outputPath);
  expect(validatePdf(outputPath, 1).text).toContain("Montant total : 1 375 EUR");
});

test("EDIT-TEXT-NATIVE-001 explique un scan sans texte natif", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionScan);
  await page.getByRole("button", { name: "Modifier le texte existant" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Aucun texte PDF natif modifiable sur cette page",
  );
  await expect(page.getByRole("button", { name: /Modifier le texte «/ })).toHaveCount(0);
});

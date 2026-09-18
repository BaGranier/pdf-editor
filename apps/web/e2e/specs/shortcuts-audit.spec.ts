import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp } from "../helpers/app";

test("UX-SHORTCUTS-AUDIT-001 réutilise les workflows d'ouverture, historique, zoom et sauvegarde", async ({ page }) => {
  await openApp(page);

  const fileChooser = page.waitForEvent("filechooser");
  await page.keyboard.press("Control+o");
  await (await fileChooser).setFiles(fixtures.onePage);
  await expect(page.getByRole("button", { name: "pdf-small-1-page.pdf, document actif" })).toBeVisible();

  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  const editLayer = page.getByLabel("Couche d'édition de la page 1");
  const layerBox = await editLayer.boundingBox();
  if (!layerBox) throw new Error("La couche d'édition est indisponible.");
  await page.mouse.move(layerBox.x + 45, layerBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(layerBox.x + 210, layerBox.y + 145, { steps: 3 });
  await page.mouse.up();
  const textEdit = page.getByLabel("Texte ajouté page 1");
  await textEdit.fill("Raccourci centralisé");
  await textEdit.evaluate((element) => element.blur());
  await expect(page.locator(".pdf-text-edit")).toHaveCount(1);

  // Focus a non-editable control: a click on the viewer background does not
  // necessarily move focus away from the textarea in every browser.
  await page.getByRole("button", { name: "Sélection" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect(textEdit).toHaveValue("");
  await page.keyboard.press("Control+y");
  await expect(textEdit).toHaveValue("Raccourci centralisé");

  await page.keyboard.press("Control++");
  await expect(page.getByTestId("zoom-level")).toHaveText("110%");
  await page.keyboard.press("Control+0");
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");

  await page.keyboard.press("Control+s");
  await expect(page.getByRole("dialog", { name: "Enregistrer sous" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Enregistrer sous" })).toBeHidden();
});

import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

async function dragInLayer(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) throw new Error("La couche d'édition est indisponible.");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 4 });
  await page.mouse.up();
}

test("EDITOR-UX-002 organise les panneaux et crée les objets par glisser", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  await expect(page.getByRole("navigation", { name: "Documents ouverts" })).toContainText("pdf-small-1-page.pdf");
  await page.getByRole("button", { name: "Vue grille" }).click();
  await expect(page.locator(".sidebar-page-list")).toHaveClass(/sidebar-page-list--grid/);
  await page.getByRole("button", { name: "Masquer les propriétés" }).click();
  await expect(page.locator("aside.properties-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Afficher les propriétés" }).click();

  await page.getByRole("button", { name: "Formes" }).click();
  await expect(page.getByRole("menu", { name: "Formes" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Formes" })).toBeHidden();
  await page.getByRole("button", { name: "Formes" }).click();
  await page.getByRole("menuitem", { name: /Rectangle/ }).click();
  await dragInLayer(page, { x: 40, y: 70 }, { x: 190, y: 150 });
  await expect(page.getByLabel("Rectangle page 1")).toBeVisible();

  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await dragInLayer(page, { x: 60, y: 190 }, { x: 240, y: 250 });
  await expect(page.getByLabel("Texte ajouté page 1")).toBeFocused();
});

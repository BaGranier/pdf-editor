import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";

test("EDIT-COMMENTS-001 lit, crée et exporte des commentaires natifs", async ({ page }) => {
  await page.route("**/pdf/annotations", async (route) => route.fulfill({ json: { annotations: [{ id: "source-comment", pageIndex: 0, type: "text", rect: { x0: 48, y0: 72, x1: 66, y1: 90 }, content: "Commentaire existant", author: "QA" }] } }));
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const existingMarker = page.getByRole("button", { name: /commentaire page 1: commentaire existant/i });
  await expect(existingMarker).toBeVisible();
  await existingMarker.click();
  await expect(page.getByRole("region", { name: "Propriétés du commentaire" })).toContainText("Commentaire existant");

  await page.getByRole("tab", { name: /commentaires \(1\)/i }).click();
  await page.locator(".comment-list").getByRole("button", { name: /page 1.*commentaire existant/i }).click();

  await page.getByRole("button", { name: "Ajouter un commentaire" }).click();
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) throw new Error("Couche d’édition non mesurable.");
  await page.mouse.click(box.x + 160, box.y + 160);
  const dialog = page.getByRole("dialog", { name: "Nouveau commentaire" });
  await dialog.getByLabel("Texte du commentaire").fill("Note locale");
  await dialog.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("button", { name: /commentaire page 1: note locale/i })).toBeVisible();
  await expect(page.getByRole("region", { name: "Propriétés du commentaire" })).toContainText("Note locale");

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("commentaires.pdf");
  const response = page.waitForResponse((candidate) => candidate.url().endsWith("/pdf/export/organize"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF" }).click();
  expect((await response).ok()).toBe(true);
  await download;
});

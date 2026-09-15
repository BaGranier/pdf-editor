import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("COMMENT-UX-003 centre le commentaire choisi dans le viewer", async ({ page }) => {
  await page.route("**/pdf/annotations", async (route) => route.fulfill({
    json: {
      annotations: [
        { id: "comment-page-3", pageIndex: 2, type: "text", rect: { x0: 48, y0: 360, x1: 66, y1: 378 }, content: "Commentaire au milieu de la page 3" },
        { id: "comment-page-5", pageIndex: 4, type: "text", rect: { x0: 48, y0: 48, x1: 66, y1: 66 }, content: "Commentaire en bas de la page 5" },
      ],
    },
  }));
  await openApp(page);
  await openPdf(page, fixtures.fivePages);

  await page.getByRole("tab", { name: /commentaires/i }).click();
  await expect(page.getByRole("group", { name: "Affichage des pages" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /commentaires/i })).toContainText("2");

  await page.locator(".comment-list").getByRole("button", { name: /page 3.*commentaire au milieu/i }).click();
  const viewer = page.getByTestId("pdf-viewer");
  const selectedMarker = page.locator("[data-comment-id='comment-page-3']");
  await expect(selectedMarker).toHaveClass(/is-selected/);
  await expect.poll(async () => {
    const [viewerBox, markerBox] = await Promise.all([viewer.boundingBox(), selectedMarker.boundingBox()]);
    if (!viewerBox || !markerBox) return false;
    const markerCentre = markerBox.y + markerBox.height / 2;
    return markerCentre > viewerBox.y + viewerBox.height * 0.2 && markerCentre < viewerBox.y + viewerBox.height * 0.8;
  }).toBe(true);

  await page.locator(".comment-list").getByRole("button", { name: /page 5.*commentaire en bas/i }).click();
  const bottomMarker = page.locator("[data-comment-id='comment-page-5']");
  await expect(bottomMarker).toHaveClass(/is-selected/);
  await expect.poll(async () => {
    const [viewerBox, markerBox] = await Promise.all([viewer.boundingBox(), bottomMarker.boundingBox()]);
    if (!viewerBox || !markerBox) return false;
    const markerCentre = markerBox.y + markerBox.height / 2;
    // A marker on the last page can be clamped by the end of the scroll range:
    // it must remain visible even when it cannot be mathematically centred.
    return markerCentre > viewerBox.y + 12 && markerCentre < viewerBox.y + viewerBox.height - 12;
  }).toBe(true);
});

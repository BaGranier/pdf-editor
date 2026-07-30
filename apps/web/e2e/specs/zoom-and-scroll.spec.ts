import { expect, test } from "../helpers/qa-test";
import {
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { VIEWER_SHORTCUTS } from "../helpers/shortcuts";

test("QA-E2E-005 @smoke met à jour le zoom et respecte ses bornes", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  const zoom = page.getByTestId("zoom-level");

  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(zoom).toHaveText("110%");
  await page.getByRole("button", { name: "Réduire le zoom" }).click();
  await expect(zoom).toHaveText("100%");

  const viewer = page.getByTestId("pdf-viewer");
  await viewer.dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(zoom).toHaveText("110%");
  await viewer.focus();
  const scrollBefore = await viewer.evaluate((element) => element.scrollTop);
  await viewer.press(VIEWER_SHORTCUTS.panDown);
  await expect
    .poll(() => viewer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(scrollBefore);

  for (let index = 0; index < 29; index += 1) {
    await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  }
  await expect(zoom).toHaveText("400%");
  await expect(page.getByRole("button", { name: "Augmenter le zoom" })).toBeDisabled();
  for (let index = 0; index < 35; index += 1) {
    await page.getByRole("button", { name: "Réduire le zoom" }).click();
  }
  await expect(zoom).toHaveText("50%");
  await expect(page.getByRole("button", { name: "Réduire le zoom" })).toBeDisabled();
});

test("QA-E2E-006 @regression navigue entre les pages sans dépasser les bornes", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.long);
  const viewer = page.getByTestId("pdf-viewer");
  await viewer.focus();

  await viewer.press(VIEWER_SHORTCUTS.firstPage);
  await expect.poll(() => viewer.evaluate((element) => element.scrollTop)).toBe(0);
  await viewer.press(VIEWER_SHORTCUTS.previousPage);
  await expect.poll(() => viewer.evaluate((element) => element.scrollTop)).toBe(0);

  await viewer.press(VIEWER_SHORTCUTS.nextPage);
  await expect
    .poll(() => viewer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const positionBeforeEnd = await viewer.evaluate((element) => element.scrollTop);
  await viewer.press(VIEWER_SHORTCUTS.lastPage);
  await expect
    .poll(() => viewer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(positionBeforeEnd);
  const endPosition = await viewer.evaluate((element) => element.scrollTop);
  await viewer.press(VIEWER_SHORTCUTS.nextPage);
  const boundedPosition = await viewer.evaluate((element) => ({
    top: element.scrollTop,
    maximum: Math.max(0, element.scrollHeight - element.clientHeight),
  }));
  expect(boundedPosition.top).toBeGreaterThanOrEqual(endPosition);
  expect(boundedPosition.top).toBeLessThanOrEqual(boundedPosition.maximum);
});

test("QA-E2E-007 @regression restaure une position de scroll propre à chaque document", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.long);
  await openPdf(page, fixtures.fivePages);
  await page.getByRole("button", { name: "pdf-long.pdf", exact: true }).click();

  const firstViewer = page.getByTestId("pdf-viewer");
  await firstViewer.evaluate((element) => {
    element.scrollTop = 900;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(() => firstViewer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "pdf-small-5-pages.pdf", exact: true })
    .click();
  const secondViewer = page.getByTestId("pdf-viewer");
  await secondViewer.evaluate((element) => {
    element.scrollTop = 350;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(() => secondViewer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "pdf-long.pdf", exact: true }).click();
  await expect
    .poll(() => page.getByTestId("pdf-viewer").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(700);
  await page.getByRole("button", { name: "pdf-small-5-pages.pdf", exact: true }).click();
  const restoredSecondPosition = await page
    .getByTestId("pdf-viewer")
    .evaluate((element) => element.scrollTop);
  expect(restoredSecondPosition).toBeGreaterThan(200);
  expect(restoredSecondPosition).toBeLessThan(700);
});

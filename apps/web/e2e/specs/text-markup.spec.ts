import { expect, test } from "../helpers/qa-test";
import { enterOrganizeMode, fixtures, openApp, openPdf } from "../helpers/app";

async function selectPdfText(page: import("@playwright/test").Page, startIndex: number, endIndex: number) {
  await page.locator(".pdf-text-layer span").first().evaluate((span, indexes) => {
    const layer = span.closest<HTMLDivElement>(".pdf-text-layer");
    if (!layer) throw new Error("Text layer introuvable.");
    const textSpans = [...layer.querySelectorAll("span")].filter((node) => node.firstChild && node.textContent?.trim());
    const start = textSpans[indexes.startIndex];
    const end = textSpans[Math.min(indexes.endIndex, textSpans.length - 1)];
    if (!start?.firstChild || !end?.firstChild) throw new Error("Texte PDF sélectionnable introuvable.");
    const range = document.createRange();
    range.setStart(start.firstChild, 0);
    range.setEnd(end.firstChild, end.firstChild.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    layer.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, { startIndex, endIndex });
  await expect(page.getByRole("toolbar", { name: "Annotations du texte" })).toBeVisible();
}

test("EDIT-TEXT-MARKUP-001 sélectionne du texte natif, annote et exporte", async ({ page, qa }) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  await expect(page.locator(".pdf-text-layer span").filter({ hasText: /\S/ }).first()).toBeVisible();

  await selectPdfText(page, 0, 1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "Annotations du texte" })).toBeHidden();

  await selectPdfText(page, 0, 1);
  await page.getByRole("button", { name: "Surligner" }).click();
  expect(await page.locator(".pdf-text-markup--highlight rect").count()).toBeGreaterThan(1);

  await selectPdfText(page, 0, 1);
  await page.getByRole("button", { name: "Souligner" }).click();
  expect(await page.locator(".pdf-text-markup--underline line").count()).toBeGreaterThan(1);

  await selectPdfText(page, 0, 1);
  await page.getByRole("button", { name: "Barrer" }).click();
  expect(await page.locator(".pdf-text-markup--strikeout line").count()).toBeGreaterThan(1);

  const highlight = page.locator(".pdf-text-markup--highlight rect").first();
  const highlightBox = await highlight.boundingBox();
  if (!highlightBox) throw new Error("Surlignage non mesurable.");
  await page.mouse.click(highlightBox.x + highlightBox.width / 2, highlightBox.y + highlightBox.height / 2);
  await expect(page.getByRole("region", { name: "Propriétés de l'annotation texte" })).toBeVisible();
  await page.getByRole("button", { name: "Couleur #dc2626" }).click();

  await enterOrganizeMode(page);
  await page.getByLabel("Nom du PDF exporté").fill("markups-texte.pdf");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/pdf/export/organize"));
  const downloadPromise = page.waitForEvent("download");
  await qa.measure("export-text-markups", () => page.getByRole("button", { name: "Exporter le PDF" }).click());
  expect((await responsePromise).ok()).toBe(true);
  await downloadPromise;
});

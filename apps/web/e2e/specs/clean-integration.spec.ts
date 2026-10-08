import path from "node:path";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

const assets = path.resolve(process.cwd(), "../../data/output/windows-qa-004/fixtures");

async function exportPdf(page: import("@playwright/test").Page, output: string, quality = "maximum") {
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter / Finaliser…" }).click();
  await page.getByLabel("Profil de compression").selectOption(quality);
  const download = page.waitForEvent("download");
  const response = page.waitForResponse(r => r.url().endsWith("/pdf/export/organize"));
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  expect((await response).status()).toBe(200);
  await (await download).saveAs(output);
}

test("CLEAN-004 image 5 Mo crop cancel undo reload resize libre et trois exports", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  await page.getByLabel("Fichier image").setInputFiles(path.join(assets, "image-5m.png"));
  const image = page.locator("[data-image-edit-id]");
  await expect(image).toHaveCount(1);
  await expect(page.getByLabel("Conserver les proportions")).not.toBeChecked();
  const before = await image.boundingBox(); if (!before) throw Error("No image");
  const handle = page.getByLabel("Redimensionner la largeur de l’image");
  const h = await handle.boundingBox(); if (!h) throw Error("No handle");
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 60, h.y + h.height / 2 + 30, { steps: 4 }); await page.mouse.up();
  const resized = await image.boundingBox(); if (!resized) throw Error("No resized image");
  expect(resized.width).toBeGreaterThan(before.width + 30); expect(resized.height).toBeCloseTo(before.height, 0);
  await page.getByRole("button", { name: "Rogner l’image", exact: true }).click();
  await expect(page.getByLabel("Cadre de rognage")).toBeVisible(); await page.keyboard.press("Escape");
  await expect(page.getByLabel("Cadre de rognage")).toHaveCount(0);
  await page.getByRole("button", { name: "Rogner l’image", exact: true }).click();
  const cropHandle = await page.getByLabel("Rogner nw", { exact: true }).boundingBox(); if (!cropHandle) throw Error("No crop handle");
  await page.mouse.move(cropHandle.x + 6, cropHandle.y + 6); await page.mouse.down();
  await page.mouse.move(cropHandle.x + 60, cropHandle.y + 40, { steps: 4 }); await page.mouse.up();
  await page.getByRole("button", { name: "Valider le rognage" }).click();
  await expect(page.getByRole("button", { name: "Rétablir l’image entière" })).toBeVisible();
  const cropped = await image.boundingBox(); if (!cropped) throw Error("No crop result");
  expect(cropped.width).toBeLessThan(resized.width - 30);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rétablir l’image entière" })).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open("pdf-editor-mvp-db"); req.onsuccess = () => resolve(req.result); });
    const docs = await new Promise<Array<{ edits?: Array<{ crop?: unknown }> }>>(resolve => { const req = db.transaction("documents").objectStore("documents").getAll(); req.onsuccess = () => resolve(req.result); }); db.close();
    return docs.some(doc => doc.edits?.some(edit => !!edit.crop));
  })).toBe(true);
  await page.reload(); await expect(image).toHaveCount(1); await image.click();
  await expect(page.getByRole("button", { name: "Rétablir l’image entière" })).toBeVisible();
  const reloaded = await image.boundingBox(); expect(reloaded?.width).toBeCloseTo(cropped.width, 0);
  for (const quality of ["maximum", "balanced", "small"]) {
    const output = info.outputPath(`crop-${quality}.pdf`); await exportPdf(page, output, quality);
    expect(validatePdf(output, 1).imageCount).toBe(1);
    await page.getByRole("button", { name: "pdf-small-1-page.pdf", exact: true }).click();
  }
  await image.click(); await page.getByRole("button", { name: "Rétablir l’image entière" }).click();
  expect((await image.boundingBox())?.width).toBeCloseTo(resized.width, 0);
});

test("CLEAN-004 highlight forme opaque ordre mixte et export", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.conversionText);
  await expect(page.locator(".pdf-text-layer span").first()).toBeVisible();
  await page.locator(".pdf-text-layer").first().evaluate(layer => {
    const node = [...layer.querySelectorAll("span")].find(span => span.firstChild && span.textContent?.trim())!;
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    layer.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Surligner", exact: true }).click();
  const highlight = await page.locator(".pdf-text-markup rect").first().boundingBox(); if (!highlight) throw Error("No highlight");
  await page.getByRole("button", { name: "Formes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(highlight.x - 8, highlight.y - 8); await page.mouse.down();
  await page.mouse.move(highlight.x + highlight.width + 8, highlight.y + highlight.height + 8, { steps: 4 }); await page.mouse.up();
  await page.getByLabel("Remplissage transparent").uncheck();
  await page.getByRole("button", { name: "Remplissage", exact: true }).click();
  await page.getByRole("button", { name: "Couleur #ffffff", exact: true }).click();
  const wrappers = page.locator(".pdf-edit-object");
  await expect(wrappers.first().locator(".pdf-text-markup")).toHaveCount(1);
  await expect(wrappers.last().locator("[data-shape-edit-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Mettre au dernier plan", exact: true }).click();
  await expect(wrappers.last().locator(".pdf-text-markup")).toHaveCount(1);
  await page.getByRole("button", { name: "Mettre au premier plan", exact: true }).click();
  await page.screenshot({ path: info.outputPath("highlight-covered.png") });
  const output = info.outputPath("highlight-covered.pdf"); await exportPdf(page, output);
  const pdf = validatePdf(output, 2); expect(pdf.drawingCount).toBeGreaterThanOrEqual(2); expect(pdf.text.length).toBeGreaterThan(10);
});

test("CLEAN-004 viewport 1080×1900 crop et poignées accessibles", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1900 });
  await openApp(page); await openPdf(page, fixtures.onePage);
  await page.getByLabel("Fichier image").setInputFiles(path.join(assets, "image-2m.jpeg"));
  await page.getByLabel("Conserver les proportions").check();
  await page.getByRole("button", { name: "Rogner l’image", exact: true }).click();
  await expect(page.getByLabel("Rognage de l’image")).toBeInViewport();
  for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
    await expect(page.getByLabel(`Rogner ${handle}`, { exact: true })).toBeInViewport();
  }
  await page.getByRole("button", { name: "Annuler le rognage" }).click();
  await expect(page.getByLabel("Conserver les proportions")).toBeChecked();
});

test("CLEAN-004 image 10 Mo PNG et JPEG réaliste sont exportables", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  for (const filename of ["image-10m.png", "image-10m.jpeg"]) await page.getByLabel("Fichier image").setInputFiles(path.join(assets, filename));
  await expect(page.locator("[data-image-edit-id]")).toHaveCount(2);
  const output = info.outputPath("large-images.pdf"); await exportPdf(page, output); expect(validatePdf(output, 1).imageCount).toBe(2);
});

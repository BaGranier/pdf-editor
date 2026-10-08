import path from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { fixtureDirectory, fixtures, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function shape(page: import("@playwright/test").Page, label: string, start = { x: 40, y: 50 }, end = { x: 180, y: 150 }) {
  await page.getByRole("button", { name: "Formes", exact: true }).click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  const box = await page.getByLabel("Couche d'édition de la page 1").boundingBox();
  if (!box) throw new Error("No edit layer");
  await page.mouse.move(box.x + start.x, box.y + start.y); await page.mouse.down();
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 5 }); await page.mouse.up();
}
async function advancedExport(page: import("@playwright/test").Page, output: string, quality = "maximum") {
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter / Finaliser…" }).click();
  await page.getByLabel("Profil de compression").selectOption(quality);
  const download = page.waitForEvent("download");
  const response = page.waitForResponse((response) => response.url().endsWith("/pdf/export/organize"));
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  expect((await response).status()).toBe(200);
  await (await download).saveAs(output);
}

test("EXPORT-PRESENTATION-003-1 Save As navigateur annulé puis sauvegardé préserve la source", async ({ page }, info) => {
  const original = readFileSync(fixtures.onePage); await openApp(page); await openPdf(page, fixtures.onePage);
  await shape(page, "Carré"); await page.getByRole("button", { name: "Sélection", exact: true }).focus();
  await page.keyboard.press("Control+s");
  const dialog = page.getByRole("dialog", { name: "Enregistrer sous", exact: true }); await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator('.document-select[aria-describedby^="document-dirty-"]')).toHaveCount(1);
  await page.keyboard.press("Control+s");
  await page.getByLabel("Nom du fichier", { exact: true }).fill("copy-editor.pdf");
  const download = page.waitForEvent("download"); await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const output = info.outputPath("copy-editor.pdf"); await (await download).saveAs(output);
  expect(validatePdf(output, 1).drawingCount).toBeGreaterThan(0);
  expect(readFileSync(fixtures.onePage).equals(original)).toBe(true);
});

test("EXPORT-PRESENTATION-003-2 images plans transparence historique persistance et export", async ({ page, qa }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  await qa.measure("insert-one-image", () => page.getByLabel("Fichier image").setInputFiles(path.join(fixtureDirectory, "editor-image.png")));
  const image = page.locator("[data-image-edit-id]"); await expect(image).toHaveCount(1);
  const imageBox = await image.boundingBox(); if (!imageBox) throw new Error("No image");
  expect(imageBox.width / imageBox.height).toBeCloseTo(2, 1);
  await page.mouse.move(imageBox.x + 20, imageBox.y + 20); await page.mouse.down(); await page.mouse.move(imageBox.x + 40, imageBox.y + 35); await page.mouse.up();
  const resize = page.getByLabel("Redimensionner l’image page 1"); const handle = await resize.boundingBox(); if (!handle) throw new Error("No resize handle");
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + 40, handle.y + 25); await page.mouse.up();
  const resized = await image.boundingBox(); if (!resized) throw new Error("No resized image"); expect(resized.width / resized.height).toBeCloseTo(2, 1);
  await shape(page, "Rectangle", { x: 40, y: 240 }, { x: 200, y: 360 });
  await page.getByLabel("Remplissage transparent").uncheck(); await page.getByLabel("Opacité de la forme", { exact: true }).fill("50");
  await page.getByRole("button", { name: "Mettre au dernier plan", exact: true }).click();
  await expect(page.locator(".pdf-edit-object").first().locator("[data-shape-edit-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator(".pdf-edit-object").first().locator("[data-image-edit-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(page.locator(".pdf-edit-object").first().locator("[data-shape-edit-id]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open("pdf-editor-mvp-db"); req.onsuccess = () => resolve(req.result); });
    const docs = await new Promise<Array<{ edits?: Array<{ type: string }> }>>((resolve) => { const req = db.transaction("documents").objectStore("documents").getAll(); req.onsuccess = () => resolve(req.result); }); db.close();
    return docs.some((doc) => doc.edits?.length === 2 && doc.edits[0].type === "shape" && doc.edits[1].type === "image");
  })).toBe(true);
  await page.reload(); await expect(image).toHaveCount(1); await expect(page.locator("[data-shape-edit-id]")).toHaveCount(1);
  await page.getByLabel("Fichier image").setInputFiles(path.join(fixtureDirectory, "editor-image.jpg")); await expect(image).toHaveCount(2);
  await page.getByLabel("Fichier image").setInputFiles(path.join(fixtureDirectory, "editor-image-oriented.jpg")); await expect(image).toHaveCount(3);
  const orientedBox = await image.last().boundingBox(); if (!orientedBox) throw new Error("No oriented image"); expect(orientedBox.width / orientedBox.height).toBeCloseTo(0.5, 1);
  const output = info.outputPath("images.pdf"); await advancedExport(page, output, "balanced");
  expect(validatePdf(output, 1).imageCount).toBe(3);
  await expect(page.getByText(/Profil : Équilibré/)).toBeVisible();
});

test("EXPORT-PRESENTATION-003-3 carré cercle flèche vectorielle", async ({ page }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  await shape(page, "Carré"); const square = page.getByLabel("Carré page 1"); await expect(square).toBeVisible();
  const box = await square.boundingBox(); if (!box) throw new Error("No square"); expect(box.width).toBeCloseTo(box.height, 1);
  await shape(page, "Cercle", { x: 200, y: 60 }, { x: 290, y: 210 }); const circle = page.getByLabel("Cercle page 1");
  const c = await circle.boundingBox(); if (!c) throw new Error("No circle"); expect(c.width).toBeCloseTo(c.height, 1);
  await shape(page, "Flèche", { x: 220, y: 300 }, { x: 50, y: 350 });
  await expect(page.getByLabel("Flèche page 1").locator("polyline")).toHaveCount(1);
  await page.getByLabel("Type de trait").selectOption("line"); await expect(page.getByLabel("Ligne page 1").locator("polyline")).toHaveCount(0);
  await page.getByRole("button", { name: "Annuler", exact: true }).click(); await expect(page.getByLabel("Flèche page 1").locator("polyline")).toHaveCount(1);
  const output = info.outputPath("constrained-arrows.pdf"); await advancedExport(page, output); expect(validatePdf(output, 1).drawingCount).toBeGreaterThanOrEqual(3);
});

test("EXPORT-PRESENTATION-003-4 présentation 20 pages conserve une frame complète et reste bornée", async ({ page, qa }, info) => {
  await openApp(page); await openPdf(page, path.join(fixtureDirectory, "editor-slides-20.pdf"));
  await page.getByLabel("Mode d'affichage").selectOption("presentation");
  await expect(page.locator('.viewer [data-page-buffer="front"][data-render-state="ready"]')).toHaveCount(1);
  await page.evaluate(() => {
    const state = { frames: 0, empty: 0, monochrome: 0, maxCanvases: 0, running: true };
    Object.assign(window, { presentationSample: state });
    const sample = () => {
      if (!state.running) return;
      const canvas = document.querySelector<HTMLCanvasElement>('.viewer [data-page-buffer="front"] canvas');
      state.frames++; state.maxCanvases = Math.max(state.maxCanvases, document.querySelectorAll(".viewer canvas").length);
      if (!canvas || !canvas.width || !canvas.height) state.empty++;
      else { const rgba = canvas.getContext("2d")!.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data; if (rgba[3] === 0 || (rgba[0] === rgba[1] && rgba[1] === rgba[2] && (rgba[0] < 4 || rgba[0] > 250))) state.monochrome++; }
      requestAnimationFrame(sample);
    }; requestAnimationFrame(sample);
  });
  await qa.measure("presentation-twenty-pages", async () => {
    for (let n = 2; n <= 20; n++) { await page.keyboard.press("ArrowRight"); await expect(page.locator(`.viewer [data-page-number="${n}"][data-page-buffer="front"][data-render-state="ready"]`)).toHaveCount(1); }
    await page.keyboard.press("Home"); await expect(page.locator('.viewer [data-page-number="1"][data-page-buffer="front"]')).toHaveCount(1);
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await expect(page.locator('.viewer [data-page-number="4"][data-page-buffer="front"]')).toHaveCount(1);
    await page.evaluate(() => { const viewer = document.querySelector<HTMLElement>(".viewer")!; viewer.style.width = "85%"; viewer.style.height = "85%"; window.dispatchEvent(new Event("resize")); });
    await expect(page.locator('.viewer [data-page-number="4"][data-render-state="ready"]')).toHaveCount(1);
  });
  const samples = await page.evaluate(() => { const state = (window as unknown as { presentationSample: { frames: number; empty: number; monochrome: number; maxCanvases: number; running: boolean } }).presentationSample; state.running = false; return state; });
  await info.attach("presentation-frames", { body: JSON.stringify(samples), contentType: "application/json" });
  expect(samples.frames).toBeGreaterThan(0); expect(samples.empty).toBe(0); expect(samples.monochrome).toBe(0); expect(samples.maxCanvases).toBeLessThanOrEqual(2);
  await page.keyboard.press("Escape"); await expect(page.getByLabel("Mode d'affichage")).toHaveValue("single-page");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.viewer [data-page-number="4"][data-render-state="ready"]')).toHaveCount(1);
});


test("EXPORT-PRESENTATION-003-5 dix images partagent un blob, plans répétés et exports", async ({ page, qa }, info) => {
  await openApp(page); await openPdf(page, fixtures.onePage);
  const memory = () => page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  const before = await memory();
  await qa.measure("insert-ten-images", async () => {
    for (let n = 1; n <= 10; n++) { await page.getByLabel("Fichier image").setInputFiles(path.join(fixtureDirectory, "editor-image.png")); await expect(page.locator("[data-image-edit-id]")).toHaveCount(n); }
  });
  await qa.measure("twenty-layer-changes", async () => {
    for (let n = 0; n < 10; n++) { await page.getByRole("button", { name: "Mettre au dernier plan", exact: true }).click(); await page.getByRole("button", { name: "Mettre au premier plan", exact: true }).click(); }
  });
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open("pdf-editor-mvp-db"); req.onsuccess = () => resolve(req.result); });
    const count = await new Promise<number>((resolve) => { const req = db.transaction("images").objectStore("images").count(); req.onsuccess = () => resolve(req.result); }); db.close(); return count;
  })).toBe(1);
  await info.attach("image-memory-indicative", { body: JSON.stringify({ before, afterTen: await memory(), sharedAssets: 1 }), contentType: "application/json" });
  for (const quality of ["maximum", "balanced", "small"]) {
    const output = info.outputPath(`ten-images-${quality}.pdf`);
    await qa.measure(`export-ten-images-${quality}`, () => advancedExport(page, output, quality));
    expect(validatePdf(output, 1).imageCount).toBeGreaterThan(0);
    // The export opens a reading copy; return to the original editable source.
    await page.locator('.document-select[title="pdf-small-1-page.pdf"]').click();
  }
  await expect(page.locator("[data-image-edit-id]")).toHaveCount(10);
});

test("EXPORT-PRESENTATION-003-6 DPR 2 zoom 50–200 thèmes et modes", async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: process.env.QA_BASE_URL ?? "http://127.0.0.1:5173", viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await openApp(page); await openPdf(page, fixtures.onePage); await shape(page, "Carré");
    for (const zoom of [50, 100, 150, 200]) {
      await page.getByRole("button", { name: "Formes", exact: true }).focus(); await page.keyboard.press("Control+0");
      const action = zoom < 100 ? "Réduire le zoom" : "Augmenter le zoom";
      for (let n = 0; n < Math.abs(zoom - 100) / 10; n++) await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByTestId("zoom-level")).toHaveText(`${zoom}%`);
      await expect(page.locator('.viewer .pdf-page[data-render-state="ready"]')).toHaveCount(1);
      const box = await page.getByLabel("Carré page 1").boundingBox(); if (!box) throw new Error("No square at zoom"); expect(box.width).toBeCloseTo(box.height, 1);
      const canvas = await page.locator(".viewer canvas").evaluate((element) => ({ width: (element as HTMLCanvasElement).width, cssWidth: parseFloat((element as HTMLCanvasElement).style.width), dpr: devicePixelRatio }));
      expect(canvas.dpr).toBe(2); expect(canvas.width / canvas.cssWidth).toBeCloseTo(2, 1);
    }
    await page.getByRole("switch", { name: "Basculer le thème" }).click();
    await page.getByLabel("Mode d'affichage").selectOption("single-page"); await expect(page.getByLabel("Carré page 1")).toBeVisible();
    await page.getByLabel("Mode d'affichage").selectOption("presentation"); await expect(page.locator('.viewer [data-page-buffer="front"][data-render-state="ready"]')).toHaveCount(1);
    await page.screenshot({ path: info.outputPath("presentation-dpr2.png") });
    await page.keyboard.press("Escape"); await expect(page.getByLabel("Mode d'affichage")).toHaveValue("single-page");
    await page.getByLabel("Mode d'affichage").selectOption("continuous"); await expect(page.getByLabel("Carré page 1")).toBeVisible();
  } finally { await context.close(); }
});

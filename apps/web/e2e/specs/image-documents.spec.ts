import { test, expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { openApp, fixtureDirectory, chooseNavigationTool } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function raster(page: Page, name: string, mimeType: string, color: string) {
  const data = await page.evaluate(({ mimeType, color }) => {
    const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = color; ctx.fillRect(0, 0, 800, 600);
    return canvas.toDataURL(mimeType).split(",")[1];
  }, { mimeType, color });
  return { name, mimeType, buffer: Buffer.from(data, "base64") };
}
async function imageMenu(page: Page) {
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Éditer le fond image…" }).click();
  await expect(page.getByRole("button", { name: "Pivoter le fond de 90°" })).toBeEnabled();
}
async function backgroundSettled(page: Page) {
  await expect(page.getByText("Transformation du fond image…", { exact: true })).toHaveCount(0);
  await expect(page.locator(".pdf-canvas").first()).toBeVisible();
}

test("IMAGE-001 JPEG : transformations, historique, annotations, persistance et export", async ({ page }, info) => {
  await openApp(page);
  const image = await raster(page, "photo.jpg", "image/jpeg", "#ff0000");
  await page.getByTestId("pdf-file-input").setInputFiles(image);
  await expect(page.locator(".document-title")).toContainText("photo.jpg · Image · JPEG");
  await expect(page.locator(".pdf-canvas").first()).toBeVisible();
  await expect(page.locator(".document-tab__dirty")).toHaveCount(0);
  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await imageMenu(page);
  await page.getByRole("button", { name: "Pivoter le fond de 90°" }).click();
  await backgroundSettled(page);
  await expect(page.locator(".document-tab__dirty")).toHaveCount(1);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await backgroundSettled(page);
  await expect(page.locator(".document-tab__dirty")).toHaveCount(0);
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await backgroundSettled(page);
  await imageMenu(page);
  await page.getByRole("button", { name: "Retourner horizontalement" }).click();
  await backgroundSettled(page);
  await imageMenu(page);
  await page.getByLabel("Ratio du cadre initial").selectOption("square");
  await page.getByRole("button", { name: "Valider le rognage" }).click();
  await backgroundSettled(page);
  await chooseNavigationTool(page, "Ajouter du texte");
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox(); if (!box) throw new Error("Page non mesurable");
  await page.mouse.move(box.x + 40, box.y + 60); await page.mouse.down();
  await page.mouse.move(box.x + 280, box.y + 120, { steps: 5 }); await page.mouse.up();
  await page.getByLabel("Texte ajouté page 1").fill("Image annotée");
  await page.getByLabel("Texte ajouté page 1").blur();
  await expect(page.locator("main")).toHaveAttribute("data-persistence-state", "saved");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.locator(".document-title")).toContainText("photo.jpg · Image · JPEG");
  await expect(page.getByLabel("Texte ajouté page 1")).toHaveValue("Image annotée");
  await page.getByRole("button", { name: "Marquage", exact: true }).click();
  await expect(page.getByRole("button", { name: "Biffer", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Exporter en PDF…" }).click();
  await page.getByLabel("Nom du fichier", { exact: true }).fill("photo-export.pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const output = info.outputPath("photo-export.pdf"); await (await download).saveAs(output);
  const pdf = validatePdf(output, 1);
  expect(pdf.text).toContain("Image annotée");
  expect(pdf.pages[0].width).toBe(600); expect(pdf.pages[0].height).toBe(450);
  await expect(page.locator(".document-tab")).toHaveCount(2);
  await expect(page.locator(".document-title").first()).toContainText("photo.jpg");
});

test("IMAGE-002 PNG/JPEG/WebP : réordonner au clavier et par glisser, puis créer trois pages", async ({ page }, info) => {
  await openApp(page);
  const images = [await raster(page, "rouge.png", "image/png", "red"), await raster(page, "vert.jpg", "image/jpeg", "lime"), await raster(page, "bleu.webp", "image/webp", "blue")];
  await page.getByRole("button", { name: "Fichier", exact: true }).click();
  await page.getByRole("menuitem", { name: "Nouveau PDF à partir d’images" }).click();
  await page.getByLabel("Ajouter des images").setInputFiles(images);
  const list = page.getByRole("list", { name: "Ordre des images" });
  await expect(list.locator("li")).toHaveCount(3);
  await page.getByRole("button", { name: "Monter bleu.webp" }).focus();
  await page.keyboard.press("Enter");
  await expect(list.locator("li").nth(1)).toContainText("bleu.webp");
  await list.locator("li").nth(1).dragTo(list.locator("li").first());
  await expect(list.locator("li").first()).toContainText("bleu.webp");
  await page.getByLabel("Format des pages").selectOption("letter");
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/images/pdf") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Créer le PDF", exact: true }).click();
  const response = await responsePromise; expect(response.ok()).toBe(true);
  await expect(page.locator(".document-title")).toHaveText("images.pdf");
  await expect(page.locator(".pdf-page")).toHaveCount(3);
  await expect(page.locator("main")).toHaveAttribute("data-persistence-state", "saved");
  const encoded = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("pdf-editor-mvp-db"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const documents = await new Promise<Array<{ fileName: string; content: Blob }>>((resolve, reject) => { const request = database.transaction("documents").objectStore("documents").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    database.close();
    const bytes = new Uint8Array(await documents.find((document) => document.fileName === "images.pdf")!.content.arrayBuffer());
    return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
  });
  const output = info.outputPath("three-images.pdf"); writeFileSync(output, Buffer.from(encoded, "base64"));
  const pdf = validatePdf(output, 3); expect(pdf.pages[0].width).toBe(792);
  const colors = JSON.parse(execFileSync("uv", ["run", "--directory", "../../services/pdf-engine", "python", "-c", "import fitz,json,sys; d=fitz.open(sys.argv[1]); print(json.dumps([p.get_pixmap().pixel(int(p.rect.width/2), int(p.rect.height/2)) for p in d]))", output], { encoding: "utf8", env: { ...process.env, UV_CACHE_DIR: "/workspace/.uv-cache" } }));
  for (const [index, expected] of [[0, [0, 0, 255]], [1, [255, 0, 0]], [2, [0, 255, 0]]] as const) colors[index].forEach((channel: number, at: number) => expect(Math.abs(channel - expected[at])).toBeLessThan(5));
  await expect(page.locator(".pdf-page")).toHaveCount(3);
  await expect(page.locator(".document-title")).toHaveText("images.pdf");
});

test("IMAGE-003 EXIF, PNG alpha, WebP déguisé, rejets et drop de fichiers", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("pdf-file-input").setInputFiles(path.join(fixtureDirectory, "editor-image-oriented.jpg"));
  await expect(page.locator(".document-select").first()).toHaveAttribute("title", /80 × 160 px/);
  const webp = await raster(page, "faux.png", "image/webp", "blue");
  webp.mimeType = "image/png";
  await page.getByTestId("pdf-file-input").setInputFiles(webp);
  await expect(page.locator(".document-title").last()).toContainText("Image · WEBP");
  const alpha = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 200;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "rgba(255,0,0,0.5)"; ctx.fillRect(0, 0, 400, 200);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("main").evaluate((target, data) => {
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], "alpha.png", { type: "image/png" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer }));
  }, alpha);
  await expect(page.locator(".document-tab")).toHaveCount(3);
  await expect.poll(async () => page.locator(".pdf-canvas").first().evaluate((node) => { const c = node as HTMLCanvasElement; return [...c.getContext("2d")!.getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3); })).toEqual([255, 127, 127]);
  await page.getByTestId("pdf-file-input").setInputFiles({ name: "cassé.png", mimeType: "image/png", buffer: Buffer.from("not a png") });
  await expect(page.getByText(/Format non pris en charge/)).toBeVisible();
  await expect(page.locator(".document-tab")).toHaveCount(3);
});

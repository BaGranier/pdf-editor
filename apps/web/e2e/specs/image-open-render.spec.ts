import { expect, test, type Locator, type Page } from "@playwright/test";
import { chooseNavigationTool, fixtures, openApp, openPdf } from "../helpers/app";

const colors = [[220, 28, 35], [31, 179, 67], [38, 83, 220], [235, 197, 25]];

async function quadrants(page: Page, name: string, mimeType: string, width: number, height: number) {
  const base64 = await page.evaluate(({ mimeType, width, height, colors }) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    colors.forEach((color, index) => {
      context.fillStyle = `rgb(${color.join(",")})`;
      context.fillRect((index % 2) * width / 2, Math.floor(index / 2) * height / 2, width / 2, height / 2);
    });
    const encoded = canvas.toDataURL(mimeType);
    if (!encoded.startsWith(`data:${mimeType};`)) throw new Error(`Codec indisponible : ${mimeType}`);
    return encoded.split(",")[1];
  }, { mimeType, width, height, colors });
  return { name, mimeType, buffer: Buffer.from(base64, "base64") };
}

async function expectQuadrants(canvas: Locator) {
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node, expected) => {
    const surface = node as HTMLCanvasElement;
    const context = surface.getContext("2d");
    if (!context || surface.width === 0 || surface.height === 0) return null;
    return expected.map((color, index) => {
      const x = Math.floor(surface.width * (index % 2 ? 0.75 : 0.25));
      const y = Math.floor(surface.height * (index >= 2 ? 0.75 : 0.25));
      const rgba = context.getImageData(x, y, 1, 1).data;
      return rgba[3] === 255 && color.every((channel, i) => Math.abs(rgba[i] - channel) <= 12);
    });
  }, colors)).toEqual([true, true, true, true]);
}

function readyPage(page: Page) {
  return page.locator('.pdf-page[data-render-state="ready"] .pdf-canvas').first();
}

test.describe("Ouverture directe sur un écran à forte densité", () => {
  test.use({ deviceScaleFactor: 5 });
  test("conserve des pixels quand la taille physique dépasse la limite du canvas", async ({ page }) => {
    await openApp(page);
    const image = await quadrants(page, "panorama.png", "image/png", 20_000, 120);
    const chooser = page.waitForEvent("filechooser");
    await page.locator("button.toolbar-icon-button[aria-label='Ouvrir un PDF']").click();
    await (await chooser).setFiles(image);
    await expect(page.locator(".document-title")).toHaveText(/panorama.png · Image · PNG/);
    await expectQuadrants(readyPage(page));
  });
});

for (const [extension, mimeType, width, height] of [
  ["png", "image/png", 640, 400],
  ["jpg", "image/jpeg", 400, 640],
  ["webp", "image/webp", 480, 480],
] as const) {
  test(`ouvre et rend réellement un document ${extension}`, async ({ page }) => {
    await openApp(page);
    const name = `quadrants.${extension}`;
    await page.getByTestId("pdf-file-input").setInputFiles(await quadrants(page, name, mimeType, width, height));
    await expect(page.locator(".document-title")).toContainText(name);
    await expectQuadrants(readyPage(page));
    await expectQuadrants(page.locator(".sidebar-page .organize-thumbnail__canvas").first());
    await expect(page.locator(".document-tab__dirty")).toHaveCount(0);
    const frame = await readyPage(page).boundingBox();
    expect(frame!.width / frame!.height).toBeCloseTo(width / height, 2);
    if (extension !== "png") return;

    const zoomOut = page.getByRole("button", { name: "Réduire le zoom" });
    const zoomIn = page.getByRole("button", { name: "Augmenter le zoom" });
    for (let step = 0; step < 5; step++) await zoomOut.click();
    await expect(page.getByTestId("zoom-level")).toHaveText("50%");
    await expectQuadrants(readyPage(page));
    for (let step = 0; step < 10; step++) await zoomIn.click();
    await expect(page.getByTestId("zoom-level")).toHaveText("150%");
    await expectQuadrants(readyPage(page));
    await page.getByLabel("Mode d'affichage", { exact: true }).selectOption("single-page");
    await page.getByRole("button", { name: "Ajuster à la page" }).click();
    await page.setViewportSize({ width: 1120, height: 780 });
    await expectQuadrants(readyPage(page));
    await openPdf(page, fixtures.onePage);
    await page.getByRole("button", { name, exact: true }).click();
    await expectQuadrants(readyPage(page));
    await expect(page.locator("main")).toHaveAttribute("data-persistence-state", "saved");
    await page.reload();
    await expect(page.locator(".document-select[aria-current='true']")).toContainText(name);
    await expectQuadrants(readyPage(page));
    await expectQuadrants(page.locator(".sidebar-page .organize-thumbnail__canvas").first());

    await page.getByRole("button", { name: "Exporter en PDF", exact: true }).click();
    await page.getByLabel("Nom du fichier", { exact: true }).fill("quadrants-export.pdf");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await download;
    await expect(page.locator(".document-select[aria-current='true']")).toContainText("quadrants-export.pdf");
    await expectQuadrants(readyPage(page));
  });
}

test("insère une image dans un PDF natif et retrouve ses couleurs dans l’export", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await chooseNavigationTool(page, "Image");
  await page.getByLabel("Fichier image", { exact: true }).setInputFiles(await quadrants(page, "objet.png", "image/png", 320, 200));
  const inserted = page.locator(".pdf-signature-edit img").first();
  await expect(inserted).toBeVisible();
  expect(await inserted.evaluate(async (node) => {
    const image = node as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 80, 50, 1, 1, 0, 0, 1, 1);
    return Array.from(context.getImageData(0, 0, 1, 1).data);
  })).toEqual([...colors[0], 255]);
  await page.getByRole("button", { name: "Enregistrer sous…" }).click();
  await page.getByLabel("Nom du fichier", { exact: true }).fill("insertion-validee.pdf");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await download;
  await expect(page.locator(".document-select[aria-current='true']")).toContainText("insertion-validee.pdf");
  const canvas = readyPage(page);
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node, expected) => {
    const canvas = node as HTMLCanvasElement;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    const hits = expected.map(() => 0);
    for (let i = 0; i < pixels.length; i += 4) {
      expected.forEach((color, index) => {
        if (color.every((channel, j) => Math.abs(channel - pixels[i + j]) <= 8)) hits[index]++;
      });
    }
    return hits.map((count) => count > 50);
  }, colors)).toEqual([true, true, true, true]);
});

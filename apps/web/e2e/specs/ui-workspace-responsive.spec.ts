import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

async function dragInEditLayer(
  page: import("@playwright/test").Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const box = await layer.boundingBox();
  if (!box) throw new Error("La couche d'édition est indisponible.");
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 3 });
  await page.mouse.up();
}

test("UI-WORKSPACE-RESPONSIVE-001 garde le workspace et son footer accessibles aux tailles desktop", async ({ page }) => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ];
  await page.setViewportSize(viewports[0]);
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const footer = page.locator("footer.status-bar");
  const viewer = page.getByTestId("pdf-viewer");
  const toolRail = page.getByRole("navigation", { name: "Outils d'édition" });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(viewer).toBeVisible();
    await expect(footer).toBeVisible();
    await page.getByRole("button", { name: "Convertir" }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "Convertir" })).toBeVisible();

    const [footerBox, viewerBox, railBox, hasGlobalOverflow] = await Promise.all([
      footer.boundingBox(),
      viewer.boundingBox(),
      toolRail.boundingBox(),
      page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight),
    ]);
    expect(footerBox).not.toBeNull();
    expect(viewerBox).not.toBeNull();
    expect(railBox).not.toBeNull();
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(viewerBox!.height).toBeGreaterThan(0);
    expect(railBox!.height).toBeGreaterThan(0);
    expect(hasGlobalOverflow).toBe(false);
  }

  const commentTool = page.getByRole("button", { name: "Commentaire" });
  await expect(commentTool).toHaveAttribute("title", "Commentaire");
  await expect(commentTool).toHaveText("Comment.");
});

test("UI-WORKSPACE-RESPONSIVE-001 garde les overlays d'édition alignés après resize et navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  await page.getByLabel("Mode d'affichage").selectOption("single-page");

  await page.getByRole("button", { name: "Formes" }).click();
  await page.getByRole("menuitem", { name: "Rectangle" }).click();
  await dragInEditLayer(page, { x: 45, y: 70 }, { x: 180, y: 135 });
  await expect(page.getByLabel("Rectangle page 1")).toBeVisible();

  await page.getByRole("button", { name: "Ajouter du texte" }).click();
  await dragInEditLayer(page, { x: 55, y: 165 }, { x: 210, y: 220 });
  const textEdit = page.getByLabel("Texte ajouté page 1");
  await textEdit.fill("Resize fiable");
  await textEdit.evaluate((element) => element.blur());
  await expect(textEdit).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(textEdit).toBeVisible();
  await expect(page.getByLabel("Rectangle page 1")).toBeVisible();

  await page.getByRole("button", { name: "Page suivante" }).click();
  await expect(page.locator(".pdf-page[data-page-number='2'][data-page-buffer='front']")).toBeVisible();
  await page.getByRole("button", { name: "Page précédente" }).click();
  await expect(page.locator(".pdf-page[data-page-number='1'][data-page-buffer='front']")).toBeVisible();
  await expect(textEdit).toBeVisible();
  await expect(page.getByLabel("Rectangle page 1")).toBeVisible();
});

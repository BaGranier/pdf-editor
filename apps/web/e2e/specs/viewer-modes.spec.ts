import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("VIEWER-MODES-001 @smoke bascule entre continu, page unique et présentation", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);

  const viewer = page.getByTestId("pdf-viewer");
  const viewerMode = page.getByLabel("Mode d'affichage");
  await expect(viewer.locator(".pdf-page")).toHaveCount(5);

  await viewerMode.selectOption("single-page");
  await expect(viewer.locator(".pdf-page")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Page précédente" })).toBeDisabled();
  await page.getByRole("button", { name: "Page suivante" }).click();
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "2");

  await page.getByRole("button", { name: "Aller à la page 5" }).click();
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "5");
  await page.getByRole("button", { name: "Page précédente" }).click();
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "4");

  await viewerMode.selectOption("presentation");
  await expect(page.locator(".app-shell")).toHaveClass(/app-shell--presentation/);
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "4");
  await expect(page.getByRole("navigation", { name: "Outils d'édition" })).toBeHidden();
  await page.keyboard.press("ArrowRight");
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "5");
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/app-shell--presentation/);
  await expect(viewerMode).toHaveValue("single-page");
  await expect(viewer.locator(".pdf-page")).toHaveAttribute("data-page-number", "5");
});

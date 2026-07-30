import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";

test("QA-E2E-018 @slow @visual capture les états stables par moteur", async ({
  page,
  qa,
}) => {
  await openApp(page);
  await expect(page).toHaveScreenshot("initial-state.png", { fullPage: true });

  await openPdf(page, fixtures.onePage);
  await expect(page).toHaveScreenshot("pdf-opened.png", { fullPage: true });
  await openPdf(page, fixtures.fivePages);
  await expect(page).toHaveScreenshot("multiple-documents.png", { fullPage: true });

  await enterOrganizeMode(page);
  await expect(page).toHaveScreenshot("organize-mode.png", { fullPage: true });
  await page.getByRole("button", { name: "Revenir à la lecture" }).click();

  const currentTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  if (currentTheme !== "light") {
    await page.getByRole("switch", { name: "Basculer le thème" }).click();
  }
  await expect(page).toHaveScreenshot("theme-light.png", { fullPage: true });
  await page.getByRole("switch", { name: "Basculer le thème" }).click();
  await expect(page).toHaveScreenshot("theme-dark.png", { fullPage: true });

  qa.allowError(/InvalidPDF|Invalid PDF|PDF.*corrupt|format error/i);
  await page.getByLabel("Ouvrir un PDF").setInputFiles(fixtures.corrupted);
  await expect(
    page
      .getByRole("complementary", { name: "Documents ouverts" })
      .getByText("Impossible d'ouvrir pdf-corrupted.pdf."),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("corrupted-pdf-error.png", { fullPage: true });
});

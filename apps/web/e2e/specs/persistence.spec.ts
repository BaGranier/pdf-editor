import { expect, test } from "../helpers/qa-test";
import {
  clearLocalData,
  enterOrganizeMode,
  fixtures,
  getLocalState,
  getStoredDocuments,
  openApp,
  openPdf,
  organizedPages,
} from "../helpers/app";

test("QA-E2E-008 @smoke restaure IndexedDB, préférences, scroll et plan sans doublon", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await openPdf(page, fixtures.fivePages);
  await page.getByRole("switch", { name: "Basculer le thème" }).click();

  const viewer = page.getByTestId("pdf-viewer");
  await viewer.evaluate((element) => {
    element.scrollTop = 420;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect
    .poll(async () =>
      (await getStoredDocuments(page)).find(
        (document) => document.fileName === "pdf-small-5-pages.pdf",
      ),
    )
    .toMatchObject({ zoom: 1.1, scrollTop: 420 });
  await enterOrganizeMode(page);
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Tourner la page 1 vers la droite" })
    .click();

  await expect
    .poll(async () => (await getLocalState(page)).documentCount)
    .toBe(2);
  await expect
    .poll(async () => (await getLocalState(page)).organizationPlans)
    .not.toBeNull();

  await page.reload();
  await expect(page.locator(".document-item")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "pdf-small-5-pages.pdf, document actif" }),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: "Basculer le thème" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("zoom-level")).toHaveText("110%");
  await expect
    .poll(() => page.getByTestId("pdf-viewer").evaluate((element) => element.scrollTop))
    .toBe(420);

  await enterOrganizeMode(page);
  await expect(organizedPages(page)).toHaveCount(5);
  await expect(organizedPages(page).first()).toHaveAttribute("data-rotation", "90");
  await expect(page.locator(".document-item")).toHaveCount(2);
});

test("QA-E2E-009 @smoke efface les données locales et conserve un état initial fonctionnel", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  await enterOrganizeMode(page);
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Dupliquer la page 1" })
    .click();
  await page.getByRole("switch", { name: "Basculer le thème" }).click();

  await clearLocalData(page);
  await expect
    .poll(async () => {
      const state = await getLocalState(page);
      return {
        documents: state.documentCount,
        plans: state.organizationPlans,
      };
    })
    .toEqual({ documents: 0, plans: null });

  const resetTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  await expect(page.locator(".document-item")).toHaveCount(0);
  await expect(page.getByLabel("Aucun PDF ouvert")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(resetTheme);
  await openPdf(page, fixtures.onePage);
});

test("QA-E2E-017 @regression persiste les thèmes clair et sombre", async ({ page }) => {
  await openApp(page);
  const themeSwitch = page.getByRole("switch", { name: "Basculer le thème" });
  const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  await themeSwitch.click();
  const toggledTheme = initialTheme === "dark" ? "light" : "dark";
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(toggledTheme);
  await expect(page.getByRole("button", { name: "Organiser" })).toBeVisible();

  await page.reload();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(toggledTheme);
  await page.getByRole("switch", { name: "Basculer le thème" }).click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(initialTheme);
});

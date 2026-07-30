import { expect, test } from "../helpers/qa-test";
import {
  enterOrganizeMode,
  fixtures,
  openApp,
  openPdf,
  organizedPages,
} from "../helpers/app";

async function createComplexPlan(page: Parameters<typeof organizedPages>[0]): Promise<void> {
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Déplacer la page 1 vers la droite" })
    .click();
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Tourner la page 1 vers la droite" })
    .click();
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Dupliquer la page 1" })
    .click();
  await organizedPages(page)
    .last()
    .getByTitle("Retirer du plan d'organisation")
    .click();
}

test("QA-E2E-010 @smoke organise, déplace, duplique, supprime et tourne les pages", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.fivePages);
  await enterOrganizeMode(page);
  await expect(organizedPages(page)).toHaveCount(5);

  await organizedPages(page).first().dragTo(organizedPages(page).nth(2));
  await expect(organizedPages(page).nth(2)).toHaveAttribute("data-source-page-index", "0");
  await organizedPages(page)
    .nth(2)
    .getByRole("button", { name: "Sélectionner la page 3" })
    .click();
  await expect(organizedPages(page).nth(2)).toHaveAttribute("aria-selected", "true");

  await createComplexPlan(page);
  await expect(organizedPages(page)).toHaveCount(5);
  await expect(organizedPages(page).first()).toHaveAttribute("data-rotation", "90");
  await expect(page.getByText("Modifié", { exact: true })).toBeVisible();

  const beforeReload = await organizedPages(page).evaluateAll((elements) =>
    elements.map((element) => ({
      source: element.getAttribute("data-source-page-index"),
      rotation: element.getAttribute("data-rotation"),
    })),
  );
  await page.reload();
  await enterOrganizeMode(page);
  await expect
    .poll(() =>
      organizedPages(page).evaluateAll((elements) =>
        elements.map((element) => ({
          source: element.getAttribute("data-source-page-index"),
          rotation: element.getAttribute("data-rotation"),
        })),
      ),
    )
    .toEqual(beforeReload);
});

test("QA-E2E-011 @regression réinitialise uniquement le plan du document actif", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await enterOrganizeMode(page);
  await organizedPages(page)
    .first()
    .getByRole("button", { name: "Tourner la page 1 vers la droite" })
    .click();

  await page.getByRole("button", { name: "Revenir à la lecture" }).click();
  await openPdf(page, fixtures.fivePages);
  await enterOrganizeMode(page);
  await createComplexPlan(page);
  await page.getByRole("button", { name: "Réinitialiser l'organisation" }).click();
  await expect(organizedPages(page)).toHaveCount(5);
  await expect(organizedPages(page).first()).toHaveAttribute("data-source-page-index", "0");
  await expect(organizedPages(page).first()).toHaveAttribute("data-rotation", "0");
  await expect(page.getByText("Ordre d'origine", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "pdf-small-1-page.pdf", exact: true }).click();
  await expect(organizedPages(page)).toHaveCount(1);
  await expect(organizedPages(page).first()).toHaveAttribute("data-rotation", "90");
});

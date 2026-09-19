import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("FORM-READONLY-RENDER-001 laisse le widget readonly au canvas sans dupliquer sa valeur", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  const name = page.getByRole("textbox", { name: "person.name (requis)" });
  await expect(name).toHaveValue("Jean Dupont");
  await expect(page.locator("[data-page-number='1']")).toHaveAttribute("data-annotation-mode", "enable_forms");
  await expect(page.getByRole("textbox", { name: "person.notes" })).toHaveValue("Note initiale");
  await expect(page.getByRole("checkbox", { name: "options.newsletter" })).toBeChecked();
  const reference = page.getByRole("textbox", { name: "document.reference" });
  await expect(reference).toHaveAttribute("readonly");
  await expect(reference).toHaveAttribute("data-form-rendering", "canvas");
  await expect(reference).toHaveCSS("opacity", "0");
  for (let step = 0; step < 5; step += 1) {
    await page.getByRole("button", { name: "Réduire le zoom" }).click();
  }
  await expect(page.getByTestId("zoom-level")).toHaveText("50%");
  await expect(reference).toHaveAttribute("data-form-rendering", "canvas");
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(reference).toHaveAttribute("data-form-rendering", "canvas");
  for (let step = 0; step < 10; step += 1) {
    await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  }
  await expect(page.getByTestId("zoom-level")).toHaveText("150%");
  await expect(reference).toHaveAttribute("data-form-rendering", "canvas");
  await name.fill("Alice QA");
  await name.blur();
  const newsletter = page.getByRole("checkbox", { name: "options.newsletter" });
  await newsletter.uncheck();
  await expect(newsletter).not.toBeChecked();
  await expect(page.getByRole("button", { name: "pdf-acroform.pdf, document actif" })).toHaveAccessibleDescription("Modifications non sauvegardées.");
});

test("FORM-LOCK-UX-001 utilise le cadenas pour le verrouillage local sans dirty state", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  const name = page.getByRole("textbox", { name: "person.name (requis)" });
  const reference = page.getByRole("textbox", { name: "document.reference" });
  const tab = page.getByRole("button", { name: "pdf-acroform.pdf, document actif" });

  const lock = page.getByRole("button", { name: "Formulaire modifiable" });
  await expect(lock).toHaveAttribute("data-lock-icon", "open");
  await lock.click();
  await expect(page.getByRole("dialog", { name: "Mode d’édition du formulaire" })).toBeVisible();
  await page.getByRole("radio", { name: /Verrouiller/ }).click();
  await expect(name).toHaveAttribute("readonly");
  await expect(reference).toHaveAttribute("readonly");
  await expect(reference).toHaveAttribute("data-form-rendering", "canvas");
  await expect(tab).not.toHaveAccessibleDescription("Modifications non sauvegardées.");
  await expect(page.getByRole("button", { name: "Formulaire verrouillé" })).toHaveAttribute("data-lock-icon", "closed");
  await page.getByRole("button", { name: "Formulaire verrouillé" }).click();
  await page.getByRole("radio", { name: /Autoriser l’édition/ }).click();
  await expect(name).not.toHaveAttribute("readonly");
  await expect(reference).toHaveAttribute("readonly");

  await page.getByRole("button", { name: "Formulaire modifiable" }).click();
  await page.getByRole("button", { name: "Verrouiller le PDF pour l'export" }).click();
  await expect(page.getByRole("dialog", { name: "Verrouiller le formulaire ?" })).toBeVisible();
  await page.getByRole("button", { name: "Verrouiller", exact: true }).click();
  await expect(page.getByRole("button", { name: "Formulaire verrouillé dans le PDF" })).toHaveAttribute("data-lock-icon", "closed");
  await expect(name).toHaveAttribute("readonly");
  await expect(tab).toHaveAccessibleDescription("Modifications non sauvegardées.");
  await page.keyboard.press("Control+z");
  await expect(name).not.toHaveAttribute("readonly");
});

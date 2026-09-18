import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("PRODUCT-EXPANSION-FIXES-002 détecte et modifie les widgets AcroForm de la page active", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  const name = page.getByRole("textbox", { name: "person.name (requis)" });
  await expect(name).toHaveValue("Jean Dupont");
  await expect(page.getByRole("textbox", { name: "person.notes" })).toHaveValue("Note initiale");
  await expect(page.getByRole("checkbox", { name: "options.newsletter" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "document.reference" })).toHaveAttribute("readonly");
  await name.fill("Alice QA");
  await name.blur();
  await expect(page.getByRole("button", { name: "pdf-acroform.pdf, document actif" })).toHaveAccessibleDescription("Modifications non sauvegardées.");
});

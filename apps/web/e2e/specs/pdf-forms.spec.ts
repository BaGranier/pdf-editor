import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("FORMS-VISUAL-LAYER-004 rend les widgets AcroForm une seule fois dans la couche interactive", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  const name = page.getByRole("textbox", { name: "person.name (requis)" });
  await expect(name).toHaveValue("Jean Dupont");
  await expect(page.locator("[data-page-number='1']")).toHaveAttribute("data-annotation-mode", "enable_forms");
  await expect(page.getByRole("textbox", { name: "person.notes" })).toHaveValue("Note initiale");
  await expect(page.getByRole("checkbox", { name: "options.newsletter" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "document.reference" })).toHaveAttribute("readonly");
  await name.fill("Alice QA");
  await name.blur();
  const newsletter = page.getByRole("checkbox", { name: "options.newsletter" });
  await newsletter.uncheck();
  await expect(newsletter).not.toBeChecked();
  await expect(page.getByRole("button", { name: "pdf-acroform.pdf, document actif" })).toHaveAccessibleDescription("Modifications non sauvegardées.");
});

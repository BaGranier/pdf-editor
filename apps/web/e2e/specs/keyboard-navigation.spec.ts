import { expect, test } from "../helpers/qa-test";
import {
  activeDocumentButton,
  fixtures,
  openApp,
  openPdf,
} from "../helpers/app";
import { DOCUMENT_SHORTCUTS } from "../helpers/shortcuts";

test("QA-E2E-004 @regression centralise et vérifie les raccourcis document", async ({
  page,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await openPdf(page, fixtures.fivePages);
  await openPdf(page, fixtures.mixed);

  const sidebar = page.getByRole("complementary", { name: "Documents ouverts" });
  await sidebar.focus();
  await sidebar.press(DOCUMENT_SHORTCUTS.first);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-small-1-page/);
  await sidebar.press(DOCUMENT_SHORTCUTS.next);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-small-5-pages/);
  await sidebar.press(DOCUMENT_SHORTCUTS.last);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-landscape-portrait/);
  await sidebar.press(DOCUMENT_SHORTCUTS.previous);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-small-5-pages/);

  const fileInput = page.getByLabel("Ouvrir un PDF");
  await fileInput.focus();
  await fileInput.press(DOCUMENT_SHORTCUTS.alternateClose);
  await expect(page.locator(".document-item")).toHaveCount(3);

  await sidebar.focus();
  await sidebar.press(DOCUMENT_SHORTCUTS.close);
  await expect(page.locator(".document-item")).toHaveCount(2);
  await expect(activeDocumentButton(page)).toHaveText(/pdf-landscape-portrait/);
});

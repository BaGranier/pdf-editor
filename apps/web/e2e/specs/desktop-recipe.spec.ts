import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../helpers/qa-test";
import { chooseNavigationTool, enterOrganizeMode, fixtureDirectory, openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

function python(source: string, target: string) {
  execFileSync("uv", ["run", "--project", "../../services/pdf-engine", "python", "-c", source, target],
    { env: { ...process.env, UV_CACHE_DIR: path.resolve("../../.uv-cache") } });
}

async function selectText(page: Page, witness: string, multiLine = false) {
  const tool = page.getByRole("button", { name: "Sélection", exact: true });
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
  const span = page.locator(".pdf-text-layer").first().locator("span").filter({ hasText: witness }).last();
  await span.evaluate((node, more) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    if (more) {
      const spans = [...node.closest(".pdf-text-layer")!.querySelectorAll("span")];
      const next = spans.slice(spans.findIndex((span) => span === node) + 1).find((span) => span.textContent?.trim());
      if (!next) throw new Error("Missing second line");
      range.setEndAfter(next);
    }
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, multiLine);
  return page.getByRole("toolbar", { name: "Annotations du texte" });
}

async function saveCopy(page: Page, filename: string) {
  await page.getByRole("button", { name: "Enregistrer sous…", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Enregistrer sous" });
  await dialog.getByRole("textbox").fill(path.basename(filename));
  page.once("dialog", (confirmation) => confirmation.accept());
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await (await pending).saveAs(filename);
}

test("sélection multilignes, saisie du commentaire dans le viewer et surbrillance avant sauvegarde", async ({ page }, info) => {
  await openApp(page);
  await openPdf(page, path.join(fixtureDirectory, "redaction-stamps.pdf"));
  const menu = await selectText(page, "SECRET_TEST_12345", true);
  const dirty = page.getByTitle("Modifications non sauvegardées");
  await expect(dirty).toHaveCount(0);
  await page.evaluate(() => document.addEventListener("copy", () => {
    document.documentElement.dataset.copied = window.getSelection()?.toString() ?? "";
  }, { once: true }));
  await page.keyboard.press("Control+c");
  await expect(page.locator("html")).toHaveAttribute("data-copied", /PUBLIC_NEIGHBOR_PAGE_1/);
  const comment = menu.getByRole("button", { name: "Commentaire" });
  await expect(comment.locator("svg")).toHaveAttribute("data-icon", "comment");
  await comment.click();
  const card = page.locator(".properties-panel").getByRole("dialog", { name: "Nouveau commentaire" });
  const popup = page.getByRole("dialog", { name: "Nouveau commentaire" }).and(page.locator(".comment-popup"));
  const workspace = page.locator(".workspace-stage");
  await expect(popup).toBeVisible();
  const [cardBounds, viewerBounds, popupBounds, anchor] = await Promise.all([
    card.boundingBox(), workspace.boundingBox(), popup.boundingBox(), page.locator(".comment-draft-anchor").boundingBox(),
  ]);
  expect(cardBounds && viewerBounds && cardBounds.x >= viewerBounds.x + viewerBounds.width - 1).toBe(true);
  expect(popupBounds && viewerBounds && popupBounds.x < viewerBounds.x + viewerBounds.width && popupBounds.x + popupBounds.width > viewerBounds.x).toBe(true);
  expect(popupBounds && anchor && (
    Math.abs(popupBounds.y + popupBounds.height - anchor.y) <= 9 ||
    Math.abs(popupBounds.y - (anchor.y + anchor.height)) <= 9
  )).toBe(true);
  const popupMessage = popup.getByLabel("Texte du commentaire");
  await expect(popupMessage).toBeFocused();
  await popupMessage.fill("Note ancrée sur deux lignes");
  const sidebarMessage = card.getByLabel("Texte du commentaire");
  await expect(sidebarMessage).toHaveValue("Note ancrée sur deux lignes");
  await sidebarMessage.fill("Note ancrée sur deux lignes, vérifiée");
  await expect(popupMessage).toHaveValue("Note ancrée sur deux lignes, vérifiée");
  await card.getByRole("button", { name: "Ajouter" }).click();
  await expect(popup).toHaveCount(0);
  const highlight = page.locator(".pdf-comment-highlight");
  await expect(highlight).toHaveCount(2);
  await expect(highlight.first()).toBeVisible();
  await expect(dirty).toHaveCount(1);
  const marker = page.locator(".pdf-comment-marker--anchored");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveCSS("width", "16px");
  await page.getByRole("button", { name: "Augmenter le zoom" }).click();
  await expect(marker).toHaveCSS("width", "16px");
  await expect(highlight).toHaveCount(2);
  await page.setViewportSize({ width: 760, height: 860 });
  await marker.click();
  const [side, viewer] = await Promise.all([page.locator(".properties-panel").boundingBox(), workspace.boundingBox()]);
  expect(side && viewer && side.y >= viewer.y + viewer.height - 1).toBe(true);
  const result = info.outputPath("comment-anchored.pdf");
  await saveCopy(page, result);
  python("import fitz,sys; d=fitz.open(sys.argv[1]); p=d[0]; n=p.first_annot; assert len(n.vertices)==8 and n.info['content']=='Note ancrée sur deux lignes, vérifiée'", result);
  await expect(page.locator(".pdf-comment-marker--anchored").first()).toBeVisible();
});

test("biffage par icône dans un Form XObject et PDF rouvert sans la ressource", async ({ page }, info) => {
  const file = info.outputPath("form-input.pdf");
  const witness = "HIDDEN_FORM_WITNESS";
  python("import fitz,sys; a=fitz.open(); p=a.new_page(width=300,height=160); p.insert_text((16,42),'HIDDEN_FORM_WITNESS'); p.insert_text((17,90),'PUBLIC_FORM'); d=fitz.open(); d.new_page(width=500,height=400).show_pdf_page(fitz.Rect(50,25,350,185),a,0); d.save(sys.argv[1])", file);
  const original = readFileSync(file);
  await openApp(page);
  await openPdf(page, file);
  const menu = await selectText(page, witness);
  const redact = menu.getByRole("button", { name: "Biffage" });
  await expect(redact.locator("svg")).toHaveAttribute("data-icon", "redaction");
  await redact.click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toHaveCount(1);
  const result = info.outputPath("form-redacted.pdf");
  await saveCopy(page, result);
  const checked = validatePdf(result, 1);
  expect(checked.text).not.toContain(witness);
  expect(checked.imageCount).toBe(1);
  python("import fitz,sys; d=fitz.open(sys.argv[1]); assert not d[0].get_xobjects(); assert d[0].get_pixmap().pixel(75,64)==(0,0,0); assert all(b'HIDDEN_FORM_WITNESS' not in d.xref_stream(i) for i in range(1,d.xref_length()) if d.xref_is_stream(i))", result);
  expect(readFileSync(file)).toEqual(original);
});

test("OCR, accordéon et brouillon de biffage avant export sécurisé", async ({ page }, info) => {
  await openApp(page);
  await openPdf(page, path.join(fixtureDirectory, "conversion-scan.pdf"));
  await chooseNavigationTool(page, "Biffer");
  const search = page.getByRole("button", { name: "Rechercher et biffer…" });
  await search.click();
  await page.getByLabel("Terme à biffer").fill("SCANNED OCR WITNESS");
  const summary = page.getByText("Occurrences détectées (1)");
  const details = summary.locator("..");
  await expect(summary).toBeVisible();
  await expect(details).not.toHaveAttribute("open");
  await expect(page.getByRole("button", { name: "Appliquer le biffage" })).toBeDisabled();
  await summary.click();
  await page.getByLabel("Sélectionner l’occurrence 1 page 1").check();
  await summary.click();
  await page.getByRole("button", { name: "Fermer onglet" }).click();
  await search.click();
  await expect(page.getByLabel("Terme à biffer")).toHaveValue("SCANNED OCR WITNESS");
  await page.getByRole("button", { name: "Appliquer le biffage" }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer onglet" }).click();
  await expect(page.getByLabel("Biffage page 1", { exact: true })).toBeVisible();
  await enterOrganizeMode(page);
  page.once("dialog", (confirmation) => confirmation.accept());
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter le PDF", exact: true }).click();
  const result = info.outputPath("scan-redacted.pdf");
  await (await pending).saveAs(result);
  python("import fitz,sys; d=fitz.open(sys.argv[1]); p=d[0]; assert not p.get_text().strip(); assert p.get_images() and any(draw['fill']==(0,0,0) for draw in p.get_drawings())", result);
});

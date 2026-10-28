import { expect, test } from "../helpers/qa-test";
import { readFileSync } from "node:fs";
import { enterOrganizeMode, fixtures, getStoredDocuments, openApp, openPdf, organizedPages } from "../helpers/app";

test("MVP-RESTORE récupère les documents valides et conserve le document invalide", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await openPdf(page, fixtures.fivePages);
  await expect.poll(async () => (await getStoredDocuments(page)).length).toBe(2);
  // Inject damage only after the last scheduled snapshot is durably committed.
  await expect(page.locator("main.app-shell")).toHaveAttribute("data-persistence-state", "saved");
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("pdf-editor-mvp-db", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("documents", "readwrite");
    const store = transaction.objectStore("documents");
    const request = store.getAll();
    request.onsuccess = () => {
      const broken = request.result.find((document: { fileName: string }) => document.fileName === "pdf-small-1-page.pdf");
      store.put({ ...broken, content: new Blob([]) });
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.reload();
    await expect(page.getByRole("button", { name: "pdf-small-5-pages.pdf, document actif" })).toBeVisible();
    await expect(page.locator(".document-tab")).toHaveCount(1);
    await expect(page.getByText(/RESTORE_BLOB_ABSENT/)).toBeVisible();
    await expect.poll(async () => (await getStoredDocuments(page)).length).toBe(2);
  }
});

test("MVP-FORMS protège l'organisation et réouvre les valeurs sauvegardées", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  const name = page.getByRole("textbox", { name: "person.name (requis)" });
  await name.fill("Alice MVP");
  await name.blur();
  await page.getByRole("checkbox", { name: "options.newsletter" }).uncheck();
  await enterOrganizeMode(page);
  await organizedPages(page).first().getByRole("button", { name: "Tourner la page 1 vers la droite" }).click();
  await expect(page.getByText(/Organisation annulée/)).toBeVisible();
  await expect(organizedPages(page).first()).toHaveAttribute("data-rotation", "0");
  await page.getByRole("button", { name: "Revenir à la lecture" }).click();
  await page.keyboard.press("Control+Shift+s");
  const pending = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Enregistrer sous" }).getByRole("button", { name: "Enregistrer", exact: true }).click();
  const download = await pending;
  await download.saveAs(testInfo.outputPath("mvp-form.pdf"));
  await expect(name).toHaveValue("Alice MVP");
  await expect(page.getByRole("checkbox", { name: "options.newsletter" })).not.toBeChecked();
});

test("MVP-FORMS désactive les champs et le verrou PDF après organisation", async ({ page }) => {
  await openApp(page);
  await openPdf(page, fixtures.acroform);
  await enterOrganizeMode(page);
  await organizedPages(page).first().getByRole("button", { name: "Tourner la page 1 vers la droite" }).click();
  await page.getByRole("button", { name: "Revenir à la lecture" }).click();
  await expect(page.getByText(/Formulaires après organisation — WIP/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "person.name (requis)" })).toHaveAttribute("readonly");
  await expect(page.getByRole("checkbox", { name: "options.newsletter" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Formulaire modifiable" })).toHaveCount(0);
});

test("MVP-CONVERT télécharge un TXT source lisible sans OCR système", async ({ page }, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  await page.getByRole("button", { name: "Convertir", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Convertir le PDF" });
  await dialog.getByLabel("Format de sortie").selectOption("txt");
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Lancer la conversion" }).click();
  const download = await pending;
  const output = testInfo.outputPath("mvp-conversion.txt");
  await download.saveAs(output);
  expect(readFileSync(output, "utf8")).toContain("français");
  await expect(page.getByRole("button", { name: "conversion-simple-text.pdf, document actif" })).toBeVisible();
});

test("MVP-SAVE-LIMIT refuse un export trop gros avant IPC et garde l'interface utilisable", async ({ page }) => {
  let nativeSaves = 0;
  await page.addInitScript(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {
      invoke: async (command: string) => {
        if (command === "get_backend_status") return { state: "ready", baseUrl: "http://127.0.0.1:8000", logPath: "", message: null };
        if (command === "get_startup_pdfs") return [];
        if (command.startsWith("save_pdf")) {
          window.dispatchEvent(new Event("mvp-unexpected-save"));
          throw new Error("Unexpected native Save");
        }
      },
    } });
  });
  await page.exposeFunction("unexpectedNativeSave", () => { nativeSaves += 1; });
  await page.addInitScript(() => window.addEventListener("mvp-unexpected-save", () => {
    void (window as unknown as { unexpectedNativeSave: () => Promise<void> }).unexpectedNativeSave();
  }));
  const source = readFileSync(fixtures.onePage);
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  await page.route("**/pdf/export/organize", route => route.fulfill({
    status: 200, contentType: "application/pdf", body: Buffer.concat([source, Buffer.alloc(25 * 1024 * 1024)]),
  }));
  await page.keyboard.press("Control+Shift+s");
  await expect(page.getByText(/dépasse la taille validée.*25 Mio/)).toBeVisible();
  const theme = page.getByRole("switch", { name: "Basculer le thème" });
  const before = await theme.getAttribute("aria-checked");
  await theme.click();
  await expect(theme).not.toHaveAttribute("aria-checked", before!);
  expect(nativeSaves).toBe(0);
  expect(readFileSync(fixtures.onePage)).toEqual(source);
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Locator, type Page } from "@playwright/test";

const helperDirectory = path.dirname(fileURLToPath(import.meta.url));
export const fixtureDirectory = path.resolve(helperDirectory, "../fixtures");

export const fixtures = {
  onePage: path.join(fixtureDirectory, "pdf-small-1-page.pdf"),
  fivePages: path.join(fixtureDirectory, "pdf-small-5-pages.pdf"),
  mixed: path.join(fixtureDirectory, "pdf-landscape-portrait.pdf"),
  long: path.join(fixtureDirectory, "pdf-long.pdf"),
  corrupted: path.join(fixtureDirectory, "pdf-corrupted.pdf"),
  large: path.join(fixtureDirectory, "pdf-large.pdf"),
  conversionText: path.join(fixtureDirectory, "conversion-simple-text.pdf"),
  conversionScan: path.join(fixtureDirectory, "conversion-scan.pdf"),
  conversionMixed: path.join(fixtureDirectory, "conversion-mixed.pdf"),
  conversionLandscape: path.join(fixtureDirectory, "conversion-landscape.pdf"),
} as const;

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "PDF Editor MVP" })).toBeVisible();
  await expect(page.getByLabel("Ouvrir un PDF")).toBeVisible();
}

export async function getLocalState(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const documentCount = database.objectStoreNames.contains("documents")
      ? await new Promise<number>((resolve, reject) => {
          const transaction = database.transaction("documents", "readonly");
          const countRequest = transaction.objectStore("documents").count();
          countRequest.onsuccess = () => resolve(countRequest.result);
          countRequest.onerror = () => reject(countRequest.error);
        })
      : 0;
    database.close();

    return {
      documentCount,
      preferences: localStorage.getItem("pdf-editor-mvp:viewer-preferences"),
      organizationPlans: localStorage.getItem("pdf-editor-mvp:organization-plans"),
    };
  });
}

export async function getStoredDocuments(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("pdf-editor-mvp-db", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const documents = await new Promise<
      Array<{ fileName: string; zoom: number; scrollLeft: number; scrollTop: number }>
    >((resolve, reject) => {
      const transaction = database.transaction("documents", "readonly");
      const getAllRequest = transaction.objectStore("documents").getAll();
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
    database.close();
    return documents;
  });
}

export async function expectInitialLocalState(page: Page): Promise<void> {
  const state = await getLocalState(page);
  expect(state.documentCount).toBe(0);
  expect(state.organizationPlans).toBeNull();
}

export async function openPdf(
  page: Page,
  pdfPath: string,
  expectedName = path.basename(pdfPath),
): Promise<void> {
  await page.getByLabel("Ouvrir un PDF").setInputFiles(pdfPath);
  await expect(
    page.getByRole("button", { name: `${expectedName}, document actif` }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: `Aperçu PDF ${expectedName}` })).toBeVisible();
  await expect(page.locator(".pdf-page").first()).toBeVisible();
}

export function activeDocumentButton(page: Page): Locator {
  return page.locator(".document-select[aria-current='true']");
}

export function organizedPages(page: Page): Locator {
  return page.getByTestId("organized-page");
}

export async function enterOrganizeMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Organiser" }).click();
  await expect(page.getByRole("heading", { name: "Organiser les pages" })).toBeVisible();
}

export async function clearLocalData(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Réinitialiser les données locales" }).click();
  await expect(page.getByLabel("Aucun PDF ouvert")).toBeVisible();
}

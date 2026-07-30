import type { Download, Page, Response, TestInfo } from "@playwright/test";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";
import { validateConversion } from "../helpers/conversion-validation";
import type { ConversionTarget } from "../../src/conversion/conversion";

type ConversionRun = {
  download: Download;
  response: Response;
};

async function runConversion(
  page: Page,
  targetFormat: ConversionTarget,
  configure?: (dialog: ReturnType<Page["getByRole"]>) => Promise<void>,
): Promise<ConversionRun> {
  await page.getByRole("button", { name: "Convertir" }).click();
  const dialog = page.getByRole("dialog", { name: "Convertir le PDF" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Format de sortie").selectOption(targetFormat);
  if (configure) {
    await configure(dialog);
  }
  const downloadPromise = page.waitForEvent("download");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/convert") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Lancer la conversion" }).click();
  await expect(page.getByRole("status")).toContainText("Conversion en cours…");
  const [download, response] = await Promise.all([
    downloadPromise,
    responsePromise,
  ]);
  expect(response.ok()).toBe(true);
  return { download, response };
}

async function saveAndReport(
  result: ConversionRun,
  targetFormat: ConversionTarget,
  testInfo: TestInfo,
  fileName: string,
) {
  const outputPath = testInfo.outputPath(fileName);
  await result.download.saveAs(outputPath);
  const validation = validateConversion(outputPath, targetFormat);
  const metadata = {
    requestedFormat: targetFormat,
    durationMs: Number(result.response.headers()["x-conversion-duration-ms"]),
    inputBytes: Number(result.response.headers()["x-conversion-input-bytes"]),
    outputBytes: Number(result.response.headers()["x-conversion-output-bytes"]),
    ocrUsed: result.response.headers()["x-conversion-ocr-used"] === "true",
    pages: result.response.headers()["x-conversion-pages"],
    textLayer: result.response.headers()["x-conversion-text-layer"],
    warnings: JSON.parse(
      decodeURIComponent(result.response.headers()["x-conversion-warnings"] || "[]"),
    ) as string[],
    technicalValidation: validation,
    downloadName: result.download.suggestedFilename(),
    mimeType: result.response.headers()["content-type"],
  };
  await testInfo.attach("conversion-result", {
    body: Buffer.from(JSON.stringify(metadata)),
    contentType: "application/json",
  });
  return { outputPath, validation, metadata };
}

test("QA-CONV-001 @smoke convertit réellement en DOCX et conserve la source", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  const result = await qa.measure("conversion-docx", () =>
    runConversion(page, "docx"),
  );
  const converted = await saveAndReport(
    result,
    "docx",
    testInfo,
    "conversion-simple-text.docx",
  );

  expect(result.download.suggestedFilename()).toBe(
    "conversion-simple-text.docx",
  );
  expect(result.response.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument",
  );
  expect(converted.validation.valid).toBe(true);
  expect(converted.validation.text).toContain("Conversion locale PDF");
  expect(converted.validation.paragraphCount).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", {
      name: "conversion-simple-text.pdf, document actif",
    }),
  ).toBeVisible();
  await expect(page.locator(".document-item")).toHaveCount(1);
  const customResult = await qa.measure("conversion-docx-custom-name", () =>
    runConversion(page, "docx", async (dialog) => {
      await dialog.getByLabel("Nom du fichier").fill("rapport client");
    }),
  );
  expect(customResult.download.suggestedFilename()).toBe("rapport client.docx");
  await testInfo.attach("conversion-screenshot", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("QA-CONV-002 @smoke convertit en TXT UTF-8 puis en HTML autonome", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionText);

  const txtResult = await qa.measure("conversion-txt", () =>
    runConversion(page, "txt", async (dialog) => {
      await dialog.getByLabel("Nom du fichier").fill("notes de conversion");
    }),
  );
  const txt = await saveAndReport(
    txtResult,
    "txt",
    testInfo,
    "notes de conversion.txt",
  );
  expect(txtResult.download.suggestedFilename()).toBe("notes de conversion.txt");
  expect(txt.validation.text).toContain("Document numérique français");
  expect(txt.validation.pageSeparators).toBe(2);

  const htmlResult = await qa.measure("conversion-html", () =>
    runConversion(page, "html"),
  );
  const html = await saveAndReport(
    htmlResult,
    "html",
    testInfo,
    "conversion-simple-text.html",
  );
  expect(html.validation.valid).toBe(true);
  expect(html.validation.pageSections).toBe(2);
  expect(html.validation.externalResourceCount).toBe(0);
  await expect(page.locator(".document-item")).toHaveCount(1);
});

test("QA-CONV-003 @regression convertit plusieurs pages PNG dans un ZIP", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  const result = await qa.measure("conversion-png", () =>
    runConversion(page, "png", async (dialog) => {
      await expect(dialog.getByLabel("Langue OCR")).toHaveCount(0);
      await dialog.getByLabel("Pages").fill("1-2");
      await dialog.getByLabel("Résolution").selectOption("96");
      await dialog.getByLabel("Format de sortie").selectOption("jpeg");
      await expect(dialog.getByLabel(/Qualité JPEG/)).toBeVisible();
      await dialog.getByLabel("Format de sortie").selectOption("png");
      await dialog.getByLabel("Nom du fichier").fill("pages retenues.png");
    }),
  );
  const converted = await saveAndReport(
    result,
    "png",
    testInfo,
    "pages retenues.zip",
  );

  expect(result.download.suggestedFilename()).toBe("pages retenues.zip");
  expect(converted.validation.archive).toBe(true);
  expect(converted.validation.names).toEqual([
    "document_page_0001.png",
    "document_page_0002.png",
  ]);
  expect(converted.validation.images?.[0]).toMatchObject({
    width: 816,
    height: 1056,
  });
});

test("QA-CONV-004 @regression affiche une erreur backend sans fermer la source", async ({
  page,
  qa,
}) => {
  // Chromium reports the intentional mocked 422 as a console resource error.
  qa.allowError(/console\.error.*422.*\/convert/i);
  await page.route("**/convert", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        code: "INVALID_PAGE_RANGE",
        message: "La plage demandée est invalide.",
      }),
    });
  });
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  await page.getByRole("button", { name: "Convertir" }).click();
  const dialog = page.getByRole("dialog", { name: "Convertir le PDF" });
  await dialog.getByLabel("Pages").fill("99");
  await dialog.getByRole("button", { name: "Lancer la conversion" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "La plage demandée est invalide.",
  );
  await expect(
    page.getByRole("button", {
      name: "conversion-simple-text.pdf, document actif",
    }),
  ).toBeVisible();
});

test("QA-CONV-005 @slow @regression utilise automatiquement l’OCR sur un scan", async ({
  page,
  qa,
}, testInfo) => {
  await openApp(page);
  await openPdf(page, fixtures.conversionScan);
  const result = await qa.measure("conversion-scan-ocr", () =>
    runConversion(page, "txt", async (dialog) => {
      await dialog.getByLabel("Langue OCR").selectOption("eng");
      await expect(dialog.getByLabel("Reconnaissance OCR")).toHaveValue("auto");
    }),
  );
  const converted = await saveAndReport(
    result,
    "txt",
    testInfo,
    "conversion-scan.txt",
  );
  expect(converted.metadata.ocrUsed).toBe(true);
  expect(converted.validation.text?.toUpperCase()).toContain("SCANNED");
});

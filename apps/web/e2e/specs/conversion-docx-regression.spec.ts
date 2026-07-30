import fs from "node:fs";
import type { Download, Page, Response, TestInfo } from "@playwright/test";
import { expect, test } from "../helpers/qa-test";
import {
  fixtures,
  getLocalState,
  getStoredDocumentUploadDiagnostics,
  openApp,
  openPdf,
} from "../helpers/app";
import { validateConversion } from "../helpers/conversion-validation";
import type { ConversionDocxMode } from "../../src/conversion/conversion";

type DocxRun = {
  download: Download;
  response: Response;
};

async function convertDocx(
  page: Page,
  mode: ConversionDocxMode,
): Promise<DocxRun> {
  await page.getByRole("button", { name: "Convertir" }).click();
  const dialog = page.getByRole("dialog", { name: "Convertir le PDF" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Format de sortie").selectOption("docx");
  await dialog.getByLabel("Mode Word").selectOption(mode);

  const downloadPromise = page.waitForEvent("download");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/convert") &&
      response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Lancer la conversion" }).click();
  const [download, response] = await Promise.all([
    downloadPromise,
    responsePromise,
  ]);
  await expect(page.getByRole("status")).toContainText("Conversion réussie");
  return { download, response };
}

async function validateAndReport(
  run: DocxRun,
  mode: ConversionDocxMode,
  restored: boolean,
  testInfo: TestInfo,
) {
  const outputPath = testInfo.outputPath(
    `conversion-${restored ? "restored" : "source"}-${mode}.docx`,
  );
  await run.download.saveAs(outputPath);
  const validation = validateConversion(outputPath, "docx");
  const requestBody = run.response.request().postData() ?? "";
  const sourceSize = fs.statSync(fixtures.conversionDocxFidelity).size;
  const inputBytes = Number(
    run.response.headers()["x-conversion-input-bytes"],
  );
  const outputBytes = Number(
    run.response.headers()["x-conversion-output-bytes"],
  );

  expect(run.response.status(), "Le backend ne doit pas retourner 502").toBe(200);
  expect(run.response.headers()["x-conversion-stage"]).toBe("completed");
  expect(inputBytes).toBe(sourceSize);
  expect(outputBytes).toBeGreaterThan(0);
  expect(requestBody).toContain('name="file"');
  expect(requestBody).toContain('filename="conversion-docx-fidelity.pdf"');
  expect(requestBody).toContain('name="target_format"');
  expect(requestBody).toContain("docx");
  expect(requestBody).toContain('name="docx_mode"');
  expect(requestBody).toContain(mode);
  expect(requestBody).toContain('name="ocr_mode"');
  expect(requestBody).toContain("auto");
  expect(requestBody).toContain('name="languages"');
  expect(requestBody).toContain("fra");
  expect(requestBody).toContain('name="output_filename"');
  expect(run.download.suggestedFilename()).toBe(
    mode === "visual"
      ? "conversion-docx-fidelity-visual.docx"
      : "conversion-docx-fidelity.docx",
  );
  expect(validation.valid).toBe(true);
  expect(validation.sectionCount).toBe(3);
  expect(validation.clippingDetected).toBe(false);
  expect(validation.exactLineRuleImageParagraphs).toBe(0);

  if (mode === "visual") {
    expect(validation.imageCount).toBe(3);
    expect(validation.imageParagraphCount).toBe(3);
    expect(validation.imageNonWhiteRatios).toHaveLength(3);
    expect(
      validation.imageNonWhiteRatios?.every((ratio) => ratio > 0.002),
    ).toBe(true);
    expect(
      validation.imageExtents?.every(
        (extent) =>
          extent.pageWidthRatio >= 0.97 &&
          extent.pageHeightRatio >= 0.97,
      ),
    ).toBe(true);
  } else {
    expect(validation.text).toContain("Engagement individuel");
    expect(validation.text).toContain("Nom de l'étudiant");
    expect(validation.text).toContain("Comportement général");
    expect(validation.text).toContain("Rappel de la législation française");
    expect(validation.paragraphCount).toBeGreaterThanOrEqual(10);
    expect(validation.imageCount).toBeGreaterThan(0);
    expect(validation.imageCount).toBeLessThanOrEqual(9);
    expect(validation.paragraphCount).toBeGreaterThan(
      validation.imageCount ?? 0,
    );
  }

  await testInfo.attach("docx-regression", {
    body: Buffer.from(
      JSON.stringify({
        browser: testInfo.project.name,
        mode,
        restored,
        httpStatus: run.response.status(),
        sentBytes: inputBytes,
        receivedBytes: outputBytes,
        sourcePageCount: 3,
        docxPageCount: validation.sectionCount,
        imageCount: validation.imageCount,
        paragraphCount: validation.paragraphCount,
        editableTextCharacters: validation.text?.length ?? 0,
        imageNonWhiteRatios: validation.imageNonWhiteRatios,
        clippingDetected: validation.clippingDetected,
        exactLineRuleImageParagraphs:
          validation.exactLineRuleImageParagraphs,
      }),
    ),
    contentType: "application/json",
  });
}

for (const restored of [false, true]) {
  test(
    `QA-CONV-DOCX-003 @regression convertit le document ${
      restored ? "restauré depuis IndexedDB" : "source"
    } en Word éditable et visuel`,
    async ({ page }, testInfo) => {
      await openApp(page);
      await openPdf(page, fixtures.conversionDocxFidelity);

      if (restored) {
        await expect
          .poll(async () => (await getLocalState(page)).documentCount)
          .toBe(1);
        const stored = await getStoredDocumentUploadDiagnostics(page);
        expect(stored).toEqual([
          expect.objectContaining({
            fileName: "conversion-docx-fidelity.pdf",
            mimeType: "application/pdf",
            size: fs.statSync(fixtures.conversionDocxFidelity).size,
            isBlob: true,
            signature: "%PDF-",
          }),
        ]);
        await page.reload();
        await expect(
          page.getByRole("button", {
            name: "conversion-docx-fidelity.pdf, document actif",
          }),
        ).toBeVisible();
        await expect(page.locator(".pdf-page").first()).toBeVisible();
      }

      for (const mode of ["editable", "visual"] as const) {
        const run = await convertDocx(page, mode);
        await validateAndReport(run, mode, restored, testInfo);
      }

      await expect(page.locator(".document-item")).toHaveCount(1);
    },
  );
}

import { existsSync } from "node:fs";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

test("QA-E2E-015 @slow @performance ouvre et ferme le PDF de robustesse", async ({
  page,
  qa,
}, testInfo) => {
  test.skip(
    !existsSync(fixtures.large),
    "Fixture > 50 Mo générée uniquement par la campagne complète.",
  );
  await openApp(page);

  const memoryBefore = await page.evaluate(() => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    return memory?.usedJSHeapSize ?? null;
  });
  await qa.measure("open-large-pdf", () => openPdf(page, fixtures.large));
  await expect(page.getByText(/250 pages/).first()).toBeVisible();
  await expect(page.getByText(/50 Mo/)).toBeVisible();
  await page.getByTestId("pdf-viewer").focus();
  await page.getByTestId("pdf-viewer").press("PageDown");
  await expect(page.locator(".pdf-page").first()).toBeVisible();

  await qa.measure("close-large-pdf", async () => {
    await page.getByRole("button", { name: "Fermer pdf-large.pdf" }).click();
    await expect(page.locator(".document-item")).toHaveCount(0);
  });
  const memoryAfter = await page.evaluate(() => {
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    return memory?.usedJSHeapSize ?? null;
  });
  await testInfo.attach("memory-sample", {
    body: Buffer.from(
      JSON.stringify({
        scope: "Heap JavaScript de la page uniquement; ne représente pas la mémoire totale.",
        beforeOpenBytes: memoryBefore,
        afterCloseBytes: memoryAfter,
      }),
    ),
    contentType: "application/json",
  });
});

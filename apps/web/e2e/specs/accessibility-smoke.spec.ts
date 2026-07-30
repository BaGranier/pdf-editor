import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";

type Rgb = [number, number, number];

function relativeLuminance([red, green, blue]: Rgb): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("QA-E2E-019 @smoke contrôle noms accessibles, clavier, focus et contraste critique", async ({
  page,
  qa,
}) => {
  await openApp(page);
  await openPdf(page, fixtures.onePage);

  const unnamedControls = await page.locator("button, input, select, a[href]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const htmlElement = element as HTMLElement;
        return !(
          ("labels" in element && (element as HTMLInputElement).labels?.length) ||
          htmlElement.getAttribute("aria-label") ||
          htmlElement.getAttribute("aria-labelledby") ||
          htmlElement.getAttribute("title") ||
          htmlElement.textContent?.trim()
        );
      })
      .map((element) => element.outerHTML),
  );
  expect(unnamedControls).toEqual([]);

  await page.getByRole("button", { name: "Organiser" }).focus();
  await page.keyboard.press("Tab");
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
  expect(["BUTTON", "INPUT", "SELECT"]).toContain(focusedTag);
  const focusOutline = await page.evaluate(() => {
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLElement
      ? getComputedStyle(activeElement).outlineStyle
      : "none";
  });
  expect(focusOutline).not.toBe("none");

  for (const theme of ["light", "dark"] as const) {
    const current = await page.evaluate(() => document.documentElement.dataset.theme);
    if (current !== theme) {
      await page.getByRole("switch", { name: "Basculer le thème" }).click();
    }
    const colors = await page.getByLabel("Ouvrir un PDF").evaluate((element) => {
      const style = getComputedStyle(element.closest("label") ?? element);
      const parse = (value: string) =>
        (value.match(/\d+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number) as Rgb;
      return {
        foreground: parse(style.color),
        background: parse(style.backgroundColor),
      };
    });
    const ratio = contrastRatio(colors.foreground, colors.background);
    if (ratio < 3) {
      qa.recordAccessibilityFinding(
        `Contraste non bloquant du contrôle d'ouverture en thème ${theme}: ${ratio.toFixed(2)}:1 (< 3:1).`,
      );
    }
    await expect(page.getByRole("button", { name: "Organiser" })).toBeVisible();
  }
});

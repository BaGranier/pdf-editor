import { expect, test } from "../helpers/qa-test";
import { chooseNavigationTool, fixtures, getLocalState, openApp, openPdf } from "../helpers/app";

test("six palettes préservent la page, l’outil, les couleurs PDF et les préférences", async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  await openPdf(page, fixtures.onePage);
  const selector = page.getByRole("combobox", { name: "Thème de l’interface" });
  await expect(selector.locator("option")).toHaveText(["Clair", "Sombre", "Océan", "Forêt", "Prune", "Sable"]);
  const canvas = page.locator(".viewer canvas").first();
  await expect(canvas).toBeVisible();
  const image = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await expect(page.locator("main")).toHaveAttribute("data-persistence-state", "saved");
  await chooseNavigationTool(page, "Ajouter du texte");
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const backgrounds = new Set<string>();
  const text = page.getByRole("button", { name: "Texte", exact: true });
  await text.click();
  const panel = page.getByRole("region", { name: "Outils Texte" });

  for (const theme of ["light", "dark", "ocean", "forest", "plum", "sand"]) {
    await selector.selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(layer).toHaveAttribute("data-active-editing-tool", "add_text");
    await expect(text).toHaveAttribute("aria-pressed", "true");
    await expect(panel).toBeVisible();
    const colors = await panel.evaluate((node) => {
      const styles = getComputedStyle(node);
      const toolbar = getComputedStyle(document.querySelector(".toolbar")!);
      const palette = getComputedStyle(document.documentElement);
      const luminance = (color: string) => {
        const channels = color.startsWith("#")
          ? color.slice(1).match(/../g)!.map((hex) => parseInt(hex, 16))
          : color.match(/\d+/g)!.map(Number).slice(0, 3);
        const [r, g, b] = channels.map((channel) => {
          const v = channel / 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const contrast = (a: string, b: string) => {
        const ca = luminance(a), cb = luminance(b);
        return (Math.max(ca, cb) + 0.05) / (Math.min(ca, cb) + 0.05);
      };
      const token = (name: string) => palette.getPropertyValue(name).trim();
      return {
        background: styles.backgroundColor,
        toolbar: toolbar.backgroundColor,
        text: contrast(styles.color, styles.backgroundColor),
        focus: contrast(token("--focus-ring"), styles.backgroundColor),
        onAccent: contrast(token("--on-accent"), token("--accent")),
        essentials: ["--app-bg", "--surface", "--text-primary", "--text-secondary", "--border", "--accent", "--focus-ring", "--danger"].every((name) => token(name)),
      };
    });
    expect(colors.background).toBe(colors.toolbar);
    expect(colors.text).toBeGreaterThanOrEqual(4.5);
    expect(colors.focus).toBeGreaterThanOrEqual(3);
    expect(colors.onAccent).toBeGreaterThanOrEqual(4.5);
    expect(colors.essentials).toBe(true);
    backgrounds.add(colors.background);
    expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(image);
    if (["light", "dark", "ocean", "sand"].includes(theme)) await page.screenshot({ path: info.outputPath(`theme-${theme}.png`) });
    await expect(page.getByRole("button", { name: "Annuler", exact: true })).toBeDisabled();
  }
  expect(backgrounds.size).toBe(6);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByTitle("Modifications non sauvegardées")).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await getLocalState(page)).preferences ?? "{}").theme).toBe("sand");
  await page.reload();
  await expect(selector).toHaveValue("sand");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sand");
  await expect(page.locator(".document-select[aria-current=true]")).toHaveText("pdf-small-1-page.pdf");
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(image);
  await openPdf(page, fixtures.fivePages);
  await expect(selector).toHaveValue("sand");
});

import { changeInterfaceTheme, openSettings } from "../helpers/app";
import { expect, test } from "../helpers/qa-test";
import { chooseNavigationTool, fixtures, getLocalState, openApp, openPdf } from "../helpers/app";

test("six palettes préservent la page, l’outil, les couleurs PDF et les préférences", async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  await openPdf(page, fixtures.conversionText);
  const selector = page.getByRole("combobox", { name: "Thème de l’interface" });
  await openSettings(page);
  await expect(selector.locator("option")).toHaveText(["Clair", "Sombre", "Océan", "Forêt", "Prune", "Sable"]);
  await page.getByRole("button", { name: "Fermer les paramètres" }).click();
  await expect(page.locator(".viewer .pdf-page").first()).toHaveAttribute("data-render-state", "ready");
  const canvas = page.locator(".viewer canvas").first();
  await expect(canvas).toBeVisible();
  const image = await canvas.evaluate((node: HTMLCanvasElement) => {
    const pixels = node.getContext("2d")!.getImageData(0, 0, node.width, node.height).data;
    if (!pixels.some((channel, index) => index % 4 === 0 && channel < 100)) throw new Error("PDF de test sans texte rendu.");
    return node.toDataURL();
  });
  await expect(page.locator("main")).toHaveAttribute("data-persistence-state", "saved");
  await chooseNavigationTool(page, "Ajouter du texte");
  const layer = page.getByLabel("Couche d'édition de la page 1");
  const backgrounds = new Set<string>();
  const text = page.getByRole("button", { name: "Texte", exact: true });
  const panel = page.getByRole("region", { name: "Outils Texte" });

  for (const theme of ["light", "dark", "ocean", "forest", "plum", "sand"]) {
    await changeInterfaceTheme(page, theme);
    await text.click();
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
    await page.getByRole("button", { name: "Fichier", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Exporter / Finaliser…" }).click();
    const dialog = page.getByRole("dialog", { name: "Exporter / Finaliser" });
    await expect(dialog).toHaveCSS("background-color", colors.background);
    await dialog.getByRole("button", { name: "Annuler", exact: true }).click();
  }
  expect(backgrounds.size).toBe(6);
  await expect(panel).toHaveCount(0);
  await expect(page.getByTitle("Modifications non sauvegardées")).toHaveCount(0);
  await expect.poll(async () => JSON.parse((await getLocalState(page)).preferences ?? "{}").theme).toBe("sand");
  await page.reload();
  await openSettings(page);
  await expect(selector).toHaveValue("sand");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sand");
  await expect(page.locator(".document-select[aria-current=true]")).toHaveText("conversion-simple-text.pdf");
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(image);
  await openPdf(page, fixtures.fivePages);
  await expect(selector).toHaveValue("sand");
});

test("crée, prévisualise, duplique et conserve plusieurs thèmes personnalisés", async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  const select = page.getByRole("combobox", { name: "Thème de l’interface" });
  await select.selectOption("forest");
  const open = page.getByRole("button", { name: "Personnaliser le thème" });
  await open.click();
  const editor = page.getByRole("region", { name: "Personnaliser le thème" });
  await expect(editor.getByLabel("Thème de base")).toHaveValue("forest");
  await editor.getByLabel("Nom", { exact: true }).fill("Recette");
  await editor.getByLabel("Accentuation").fill("#136843");
  const accent = () => page.locator("html").evaluate((root) => getComputedStyle(root).getPropertyValue("--accent").trim());
  await expect.poll(accent).toBe("#136843");
  await editor.getByRole("button", { name: "Enregistrer le thème" }).click();
  await page.reload();
  await openSettings(page);
  await expect(select.locator("option:checked")).toHaveText("Recette");
  await expect.poll(accent).toBe("#136843");
  await open.click();
  await editor.getByRole("button", { name: "Dupliquer" }).click();
  await editor.getByLabel("Nom", { exact: true }).fill("Deuxième");
  await editor.getByRole("button", { name: "Enregistrer le thème" }).click();
  await expect(select.locator("option:checked")).toHaveText("Deuxième");
  await expect(select.locator("option")).toHaveCount(8);
  await open.click();
  await editor.getByLabel("Fond", { exact: true }).fill("#ffffff");
  await editor.getByRole("button", { name: "Annuler" }).click();
  await open.click();
  await expect(editor.getByLabel("Fond", { exact: true })).not.toHaveValue("#ffffff");
  await editor.getByRole("button", { name: "Supprimer le thème" }).click();
  await expect(select).toHaveValue("forest");
  await select.selectOption({ label: "Recette" });
  await expect.poll(accent).toBe("#136843");
  await select.selectOption("forest");
  await expect.poll(accent).not.toBe("#136843");
  await page.getByRole("combobox", { name: "Langue de l’interface" }).selectOption("en");
  await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "File", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await openSettings(page);
  await expect(page.getByRole("combobox", { name: "Interface language" })).toHaveValue("en");
  await expect(page.getByRole("combobox", { name: "Interface theme" }).locator("option")).toContainText(["Recette"]);
  await page.getByRole("combobox", { name: "Interface language" }).selectOption("fr");
  await expect(page.getByRole("button", { name: "Ouvrir un PDF", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

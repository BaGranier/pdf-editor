import { execFileSync } from "node:child_process";
import { expect, test } from "../helpers/qa-test";
import { ensureCorpus, exportPdf, python, root, scene, seed, selectObject, state } from "../helpers/robustness";

test.beforeAll(ensureCorpus);
test("COMPOSITION-008 scene globale, quatre plans et alpha viewer/export/reopen", async ({ page }, info) => {
  test.setTimeout(180_000);
  const source = scene();
  await seed(page, [{id: "global", edits: source.edits}], source.assets);
  await expect(page.locator(".pdf-edit-object")).toHaveCount(source.edits.length);
  let edits = source.edits;
  const results = [];
  for (const [index, action] of [null, "Mettre au dernier plan", "Avancer d’un plan", "Mettre au premier plan", "Reculer d’un plan"].entries()) {
    if (action) {
      await selectObject(page, "opaque", edits);
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect.poll(async () => (await state(page)).docs[0].edits?.map((edit) => edit.id).join(",")).not.toBe(edits.map((edit) => edit.id).join(","));
      const saved = (await state(page)).docs.find((doc) => doc.id === "global")!;
      const expectedIndex = action === "Mettre au dernier plan" ? 0 : action === "Avancer d’un plan" ? 1 : action === "Mettre au premier plan" ? edits.length - 1 : edits.length - 2;
      expect(saved.edits!.findIndex((edit) => edit.id === "opaque")).toBe(expectedIndex);
      edits = saved.edits as typeof edits;
    }
    // Deselect without adding an object; keep editing adornments out of probes.
    await page.getByRole("button", { name: "Sélection", exact: true }).click();
    const viewer = info.outputPath(`viewer-${index}.png`);
    await page.locator(".page-surface").first().screenshot({path: viewer});
    const output = await exportPdf(page, info, `global-${index}`);
    const check = execFileSync(python, ["-m", "scripts.editor-robustness-fixtures", "--compare", output.destination, viewer], {cwd: root, encoding: "utf8"});
    results.push({action, durationMs: output.durationMs, validation: JSON.parse(check)});
    // Reopen the actual exported PDF in PDF.js (export already opened it).
    await expect(page.locator(".pdf-page canvas").first()).toBeVisible();
    await page.getByRole("button", {name: `Fermer ${output.fileName}`, exact: true}).click();
    await page.getByRole("button", {name: "global.pdf, document actif", exact: true}).click();
  }
  for (const alpha of [0,25,50,75,100]) {
    await selectObject(page, "alpha", edits);
    await page.getByLabel("Opacité de la forme", {exact: true}).fill(String(alpha));
    await page.getByRole("button", {name: "Sélection", exact: true}).click();
    const viewer = info.outputPath(`alpha-${alpha}.png`);
    await page.locator(".page-surface").first().screenshot({path: viewer});
    const output = await exportPdf(page, info, `alpha-${alpha}`);
    execFileSync(python, ["-m", "scripts.editor-robustness-fixtures", "--compare", output.destination, viewer], {cwd: root});
    await page.getByRole("button", {name: `Fermer ${output.fileName}`, exact: true}).click();
  }
  await info.attach("composition-metrics", {body: JSON.stringify(results,null,2), contentType: "application/json"});
});

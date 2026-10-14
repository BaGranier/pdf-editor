import { chromium, firefox } from "@playwright/test";
import { expect, test } from "../helpers/qa-test";
import { fixtures, openApp, openPdf } from "../helpers/app";
import { ensureCorpus, exportPdf, scene, seed, state } from "../helpers/robustness";
import { validatePdf } from "../helpers/pdf-validation";

test.beforeAll(ensureCorpus);
test("RESTORE-008 fermeture réelle du navigateur, deux documents, crop et assets partagés",async({browserName},info)=>{
  const engine=browserName==="chromium"?chromium:firefox;
  const profile=info.outputPath("isolated-profile");
  let context=await engine.launchPersistentContext(profile,{headless:true,baseURL:String(info.project.use.baseURL)});
  try {
    const page=await context.newPage(); const fixture=scene();
    await seed(page,[{id:"one",edits:fixture.edits,dirty:true},{id:"two",edits:fixture.edits}],fixture.assets);
    await expect(page.locator("[data-image-edit-id]")).toHaveCount(2);
    await expect.poll(async()=>(await state(page)).assetCount).toBe(2);
    const before=await state(page);
    await context.close();
    context=await engine.launchPersistentContext(profile,{headless:true,baseURL:String(info.project.use.baseURL)});
    const reopened=await context.newPage(); await openApp(reopened);
    await expect(reopened.locator(".document-select")).toHaveCount(2);
    await expect(reopened.locator("[data-image-edit-id]")).toHaveCount(2);
    const after=await state(reopened);
    expect(after.docs.map(d=>d.edits)).toEqual(before.docs.map(d=>d.edits));
    expect(after.assetCount).toBe(2);
    await expect(reopened.locator('.document-select[title="one.pdf"]')).toHaveAttribute("aria-describedby",/document-dirty/);
    await reopened.getByRole("button",{name:"two.pdf",exact:true}).click();
    await expect(reopened.locator("[data-image-edit-id]")).toHaveCount(2);
    await info.attach("persistent-profile-assets",{body:JSON.stringify({before,after},null,2),contentType:"application/json"});
  } finally { await context.close(); }
});

test("RESTORE-008 métadonnées de viewport partielles : source rendue avec valeurs sûres",async({page})=>{
  const fixture=scene(); await seed(page,[{id:"partial",edits:[]}],[]);
  await page.goto("/fonts/NOTICE.md");
  await page.evaluate(async()=>{
    const request=indexedDB.open("pdf-editor-mvp-db");
    const db=await new Promise<IDBDatabase>(resolve=>{request.onsuccess=()=>resolve(request.result);});
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction("documents","readwrite"); const store=tx.objectStore("documents"); const get=store.get("partial");
      get.onsuccess=()=>{const record=get.result;delete record.zoom;delete record.scrollLeft;delete record.scrollTop;store.put(record);};
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });db.close();
  });
  await page.goto("/");
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
  await expect(page.getByTestId("zoom-level")).toHaveText("100%");
});

test("EXTREME-008 @slow 250 pages / 51 Mio, plusieurs documents, restauration et exports successifs",async({page},info)=>{
  test.setTimeout(180_000);
  await openApp(page);await openPdf(page,fixtures.onePage);await openPdf(page,fixtures.fivePages);await openPdf(page,fixtures.large);
  await expect(page.locator(".document-select")).toHaveCount(3);
  await page.getByLabel("Mode d'affichage").selectOption("single-page");
  await page.getByRole("button",{name:"Aller à la page 250",exact:true}).click();
  await expect(page.locator('.viewer [data-page-number="250"][data-render-state="ready"]')).toHaveCount(1);
  await page.getByRole("button",{name:"Augmenter le zoom",exact:true}).click();
  await expect.poll(async()=>(await state(page)).docs.length).toBe(3);
  await page.reload(); await expect(page.locator(".document-select")).toHaveCount(3);
  await expect(page.locator(".viewer .pdf-canvas").first()).toBeVisible();
  const metrics=[];
  for(const quality of ["maximum","small"]){
    const output=await exportPdf(page,info,`large-${quality}`,quality);
    expect(validatePdf(output.destination,250).valid).toBe(true);
    metrics.push({quality,durationMs:output.durationMs,state:await state(page)});
    await page.getByRole("button",{name:`Fermer ${output.fileName}`,exact:true}).click();
  }
  await expect(page.locator(".document-select")).toHaveCount(3);
  await info.attach("large-pdf-metrics",{body:JSON.stringify(metrics,null,2),contentType:"application/json"});
});

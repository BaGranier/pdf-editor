import { expect, test } from "../helpers/qa-test";
import path from "node:path";
import { ensureCorpus, exportPdf, manifest, corpus, state } from "../helpers/robustness";
import { openApp, openPdf } from "../helpers/app";
import { validatePdf } from "../helpers/pdf-validation";

async function drag(page: import("@playwright/test").Page, locator: import("@playwright/test").Locator, dx: number, dy: number) {
  const box=await locator.boundingBox(); if(!box) throw Error("No interaction target");
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2+dy,{steps:2}); await page.mouse.up();
}

test.beforeAll(ensureCorpus);
test("STRESS-008 @slow 20 assets distincts, 3 cycles, 50 mutations, 30 undo/redo et exports lourds",async({page,browserName},info)=>{
  test.setTimeout(360_000);
  page.setDefaultTimeout(20_000);
  const catalog=manifest();
  const assets=catalog.assets.map(asset=>({id:`image-${asset.sha256}`}));
  expect(assets).toHaveLength(20); expect(new Set(catalog.assets.map(a=>a.sha256)).size).toBe(20);
  expect(catalog.assets.some(a=>a.bytes>1_000_000&&a.width*a.height>2_000_000)).toBe(true);
  const metrics: Array<Record<string,unknown>>=[];
  const cdp=browserName==="chromium"?await page.context().newCDPSession(page):null;
  await openApp(page);
  for(let cycle=0;cycle<3;cycle++) {
    // Reuse the same application realm across cycles, so reload cannot hide retained resources.
    console.log(`STRESS-008 cycle ${cycle + 1}: open and import 20 assets`);
    const started=Date.now(); await openPdf(page,path.join(corpus,"scene.pdf"));
    for(const [index,asset] of catalog.assets.entries()) {
      await page.getByLabel("Fichier image").setInputFiles(path.join(corpus,asset.fileName));
      await expect(page.locator("[data-image-edit-id]")).toHaveCount(index+1);
    }
    const documentId=await page.locator('.document-select[aria-current="true"]').getAttribute("data-document-id");
    await page.locator('[data-image-edit-id]').last().click();
    await page.keyboard.press("Control+c");
    for(let n=0;n<5;n++) await page.keyboard.press("Control+v");
    await expect(page.locator("[data-image-edit-id]")).toHaveCount(25);
    // Content hashing must also deduplicate an independently reimported file.
    await page.getByLabel("Fichier image").setInputFiles(path.join(corpus,catalog.assets[0].fileName));
    await expect(page.locator("[data-image-edit-id]")).toHaveCount(26);
    const selected=()=>page.locator("[data-image-edit-id].is-selected");
    console.log(`STRESS-008 cycle ${cycle + 1}: 50 image mutations`);
    for(let n=0;n<20;n++) await drag(page,selected(),n%2? -4:4,n%2?-3:3);
    for(let n=0;n<20;n++) await drag(page,page.getByLabel("Redimensionner l’image page 1",{exact:true}),n%2?-3:3,n%2?-2:2);
    for(let n=0;n<10;n++) {
      await page.getByRole("button",{name:"Rogner l’image",exact:true}).click();
      await drag(page,page.getByLabel("Rogner nw",{exact:true}),2,2);
      await page.getByRole("button",{name:"Valider le rognage",exact:true}).click();
    }
    await page.getByRole("button",{name:"Mettre au dernier plan",exact:true}).click();
    await page.getByRole("button",{name:"Mettre au premier plan",exact:true}).click();
    // Focus the viewer object so app history, rather than a field's native history, is exercised.
    await selected().focus();
    for(let n=0;n<15;n++) {await page.keyboard.press("Control+z");await page.keyboard.press("Control+y");}
    await page.keyboard.press("Delete"); await expect(page.locator("[data-image-edit-id]")).toHaveCount(25);
    await page.keyboard.press("Control+z"); await expect(page.locator("[data-image-edit-id]")).toHaveCount(26);
    await expect.poll(async()=> (await state(page)).docs.find(d=>d.id===documentId)?.edits?.length).toBe(26);
    const stable=await state(page); expect(stable.assetCount).toBe(20);
    expect(stable.docs[0].edits?.filter(e=>e.imageId===assets[19].id)).toHaveLength(6);
    expect((await state(page)).assetCount).toBe(20);
    console.log(`STRESS-008 cycle ${cycle + 1}: heavy exports`);
    const exports=[];
    for(const quality of ["maximum","small"]) {
      const output=await exportPdf(page,info,`stress-${cycle}-${quality}`,quality);
      const validated=validatePdf(output.destination,1); expect(validated.valid).toBe(true); expect(validated.text).toContain("SOURCE SELECTABLE");
      exports.push({quality,durationMs:output.durationMs,imageCount:validated.imageCount});
      await page.getByRole("button",{name:`Fermer ${output.fileName}`,exact:true}).click();
    }
    await page.getByRole("button",{name:"Augmenter le zoom",exact:true}).click();
    await page.getByTestId("pdf-viewer").evaluate(e=>{e.scrollTop=120;e.dispatchEvent(new Event("scroll"));});
    if(cdp) await cdp.send("HeapProfiler.collectGarbage");
    const heap=cdp?await cdp.send("Runtime.getHeapUsage"):null;
    metrics.push({cycle,renderAndOperationsMs:Date.now()-started,stable,heap,exports});
    // Discard dialog is expected after editing the source; assets then lose their document references.
    await page.getByRole("button",{name:"Fermer scene.pdf",exact:true}).click();
    const discard=page.getByRole("button",{name:"Ignorer les modifications",exact:true}); if(await discard.isVisible()) await discard.click();
    await expect.poll(async()=>(await state(page)).assetCount).toBe(0);
    await expect(page.locator(".viewer canvas")).toHaveCount(0);
    if(cdp) await cdp.send("HeapProfiler.collectGarbage");
    metrics[metrics.length-1].closed={state:await state(page),heap:cdp?await cdp.send("Runtime.getHeapUsage"):null};
    console.log(`STRESS-008 cycle ${cycle + 1}: closed, persisted assets = 0`);
  }
  await info.attach("asset-stress-cycles",{body:JSON.stringify({scope:"page JS heap only; excludes PDF.js workers/GPU/native allocations",metrics},null,2),contentType:"application/json"});
});

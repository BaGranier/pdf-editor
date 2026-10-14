import { expect, test } from "../helpers/qa-test";
import { ensureCorpus, scene, seed, state, stressAssets } from "../helpers/robustness";

test.beforeAll(ensureCorpus);
test("STORAGE-008 quota injecté borné : dernières modifications et assets restent disponibles", async ({ page }) => {
  await page.goto("/fonts/NOTICE.md");
  const assets = scene().assets;
  const result = await page.evaluate(async (assets) => {
    const modulePath = "/src/storage/viewerStorage.ts";
    const storage = await import(/* @vite-ignore */ modulePath);
    await storage.clearViewerStorage();
    const snapshot = {id:"quota",fileName:"quota.pdf",mimeType:"application/pdf",content:new Blob(["%PDF-synthetic"]),pageCount:1,zoom:1,scrollLeft:0,scrollTop:0,
      edits:[{id:"old",type:"image",page:1,rect:{x0:0,y0:0,x1:10,y1:10},imageId:assets[0].id}],imageAssets:[assets[0]]};
    if (!await storage.saveStoredDocument(snapshot)) throw Error("Initial durable write failed");
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      this.transaction.abort();
      throw new DOMException("Synthetic bounded quota", "QuotaExceededError");
    };
    const saved = await storage.saveStoredDocument({...snapshot,editsDirty:true,edits:[{...snapshot.edits[0],id:"new",imageId:assets[1].id}],imageAssets:[assets[1]]});
    IDBObjectStore.prototype.put = put;
    const current = await storage.loadStoredDocument("quota");
    const currentAssets = await storage.loadImageAssets([assets[1].id]);
    return {saved,edit:current.edits[0].id,dirty:current.editsDirty,asset:currentAssets[assets[1].id]?.id};
  }, assets);
  expect(result).toEqual({saved:false,edit:"new",dirty:true,asset:assets[1].id});
});

test("STORAGE-008 récupération puis fermeture libèrent le repli mémoire", async ({ page }) => {
  await page.goto("/fonts/NOTICE.md");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/storage/viewerStorage.ts";
    const storage = await import(/* @vite-ignore */ modulePath);
    await storage.clearViewerStorage();
    const snapshot = {id:"ghost",fileName:"ghost.pdf",mimeType:"application/pdf",content:new Blob(["%PDF-synthetic"]),pageCount:1,zoom:1,scrollLeft:0,scrollTop:0};
    const descriptor = Object.getOwnPropertyDescriptor(window,"indexedDB");
    const database = window.indexedDB;
    Object.defineProperty(window,"indexedDB",{configurable:true,value:undefined});
    await storage.saveStoredDocument(snapshot);
    Object.defineProperty(window,"indexedDB",{configurable:true,value:database});
    const recovered = await storage.saveStoredDocument(snapshot);
    await storage.removeStoredDocument("ghost");
    Object.defineProperty(window,"indexedDB",{configurable:true,value:undefined});
    const retained = await storage.loadStoredDocument("ghost");
    if (descriptor) Object.defineProperty(window,"indexedDB",descriptor);
    else Object.defineProperty(window,"indexedDB",{configurable:true,value:database});
    return {recovered,retained};
  });
  expect(result).toEqual({recovered:true,retained:null});
});

test("STORAGE-008 asset absent : rendu contrôlé, export bloqué, source conservée", async ({page}) => {
  const fixture = scene();
  await seed(page,[{id:"missing",edits:fixture.edits.filter((edit)=>edit.type==="image"),dirty:true}],[]);
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
  const before = (await state(page)).docs[0].sourceBytes;
  await page.getByRole("button",{name:"Enregistrer sous…",exact:true}).click();
  await page.getByRole("dialog",{name:"Enregistrer sous",exact:true}).getByRole("button",{name:"Enregistrer",exact:true}).click();
  await expect(page.getByText(/Une image insérée est indisponible/).first()).toBeVisible();
  await expect(page.locator(".document-select")).toHaveCount(1);
  expect((await state(page)).docs[0].sourceBytes).toBe(before);
  await page.reload();
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
});

test("STORAGE-008 remplissage progressif borné à 2 Mio, puis récupération",async({page})=>{
  const assets=stressAssets().reverse();
  await page.goto("/fonts/NOTICE.md");
  const result=await page.evaluate(async(assets)=>{
    const modulePath="/src/storage/viewerStorage.ts";const storage=await import(/* @vite-ignore */modulePath);
    await storage.clearViewerStorage();
    const put=IDBObjectStore.prototype.put;let used=0;const limit=2*1024*1024;
    IDBObjectStore.prototype.put=function(value,key){
      if(this.name==="images"){
        const bytes=Math.ceil(value.dataUrl.length*3/4);
        if(used+bytes>limit){this.transaction.abort();throw new DOMException("Bounded QA quota","QuotaExceededError");}
        used+=bytes;
      }
      return key===undefined?put.call(this,value):put.call(this,value,key);
    };
    const writes=[];
    try {
      for(let index=0;index<assets.length;index++){
        const asset=assets[index];
        writes.push(await storage.saveStoredDocument({id:`bounded-${index}`,fileName:"synthetic.pdf",mimeType:"application/pdf",content:new Blob(["%PDF-synthetic"]),pageCount:1,zoom:1,scrollLeft:0,scrollTop:0,
          edits:[{id:"image",type:"image",imageId:asset.id,page:1,rect:{x0:0,y0:0,x1:50,y1:30}}],imageAssets:[asset]}));
      }
    } finally {IDBObjectStore.prototype.put=put;}
    const last=await storage.loadStoredDocument(`bounded-${assets.length-1}`);
    const recovered=await storage.saveStoredDocument({...last,imageAssets:[assets[assets.length-1]]});
    return {used,writes,recovered,lastId:last.id};
  },assets);
  expect(result.used).toBeLessThanOrEqual(2*1024*1024);
  expect(result.writes.filter(Boolean).length).toBeGreaterThan(1);
  expect(result.writes).toContain(false);
  expect(result.recovered).toBe(true);
});

test("STORAGE-008 quota : message utilisateur et récupération sans perte de source",async({page})=>{
  const fixture=scene();await seed(page,[{id:"quota-ui",edits:fixture.edits,dirty:true}],fixture.assets);
  await page.evaluate(()=>{
    const put=IDBObjectStore.prototype.put;
    Object.assign(window,{restoreQaPut:()=>{IDBObjectStore.prototype.put=put;}});
    IDBObjectStore.prototype.put=function(){this.transaction.abort();throw new DOMException("Bounded QA failure","QuotaExceededError");};
  });
  await page.getByRole("button",{name:"Augmenter le zoom",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("ne peuvent pas être conservés durablement");
  await expect(page.locator(".viewer .pdf-canvas")).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {restoreQaPut:()=>void}).restoreQaPut();});
  await page.getByRole("button",{name:"Augmenter le zoom",exact:true}).click();
  await expect.poll(async()=> (await state(page)).docs[0].edits?.length).toBe(fixture.edits.length);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();await expect(page.locator(".pdf-edit-object")).toHaveCount(fixture.edits.length);
});

import { expect, test } from "../helpers/qa-test";
import { ensureCorpus, scene, seed, selectObject } from "../helpers/robustness";
import type { Locator } from "@playwright/test";

async function contrast(control: Locator) {
  return control.evaluate((element) => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
    let background = [255,255,255];
    const chain: Element[] = []; for (let node: Element | null = element; node; node=node.parentElement) chain.unshift(node);
    for (const node of chain) {
      const color = rgb(getComputedStyle(node).backgroundColor); const alpha = color[3] ?? 1;
      background = background.map((channel,index) => channel*(1-alpha)+(color[index]??0)*alpha);
    }
    const style = getComputedStyle(element); const foreground = rgb(style.color);
    const luminance = (channels: number[]) => channels.slice(0,3).map((n)=>n/255).map((n)=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,index)=>sum+n*[.2126,.7152,.0722][index],0);
    const a=luminance(foreground),b=luminance(background);
    const opacity=Number(style.opacity);
    const effective=luminance(foreground.slice(0,3).map((n,i)=>n*opacity+background[i]*(1-opacity)));
    const ring=luminance(rgb(style.outlineColor));
    return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),effectiveRatio:(Math.max(effective,b)+.05)/(Math.min(effective,b)+.05),
      ringRatio:(Math.max(ring,b)+.05)/(Math.min(ring,b)+.05),opacity,foreground,background,disabled:(element as HTMLButtonElement).disabled??false,
      outline:style.outlineColor,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};
  });
}

test.beforeAll(ensureCorpus);
test("A11Y-008 sombre : contraste ciblé toolbar/menu/palette/inspector/dialogue/erreur", async ({page},info)=>{
  const fixture=scene(); await seed(page,[{id:"global",edits:fixture.edits,dirty:true}],fixture.assets);
  await page.getByRole("switch",{name:"Basculer le thème"}).click();
  await selectObject(page,"alpha",fixture.edits);
  const measurements: unknown[]=[];
  for(const control of [page.getByRole("button",{name:"Fichier",exact:true}),page.getByRole("button",{name:"Ajouter du texte",exact:true}),page.getByRole("region",{name:"Ordre des plans"}).getByRole("button").first()]) {
    const result=await contrast(control); measurements.push(result); expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  }
  const fill=page.getByRole("button",{name:"Remplissage",exact:true});
  await fill.click(); const palette=page.getByRole("dialog",{name:"Remplissage palette",exact:true});
  await expect(palette).toBeVisible();
  const paletteText=await contrast(palette.locator("label").first()); measurements.push(paletteText); expect(paletteText.ratio).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Fichier",exact:true}).click();
  const menu=page.getByRole("menuitem",{name:/Exporter \/ Finaliser/});
  const menuText=await contrast(menu); measurements.push(menuText); expect(menuText.ratio).toBeGreaterThanOrEqual(4.5);
  await menu.click(); const dialog=page.getByRole("dialog",{name:"Exporter / Finaliser",exact:true});
  const label=await contrast(dialog.locator("label").first()); measurements.push(label); expect(label.ratio).toBeGreaterThanOrEqual(4.5);
  await dialog.getByLabel("Mot de passe d’ouverture",{exact:true}).fill("synthetic-mismatch");
  await dialog.getByRole("button",{name:"Exporter",exact:true}).click();
  const error=await contrast(dialog.getByRole("alert")); measurements.push(error); expect(error.ratio).toBeGreaterThanOrEqual(4.5);
  await info.attach("dark-contrast",{body:JSON.stringify(measurements,null,2),contentType:"application/json"});
});

test("A11Y-008 clavier : palette et modale capturent/restaurent le focus", async ({page})=>{
  const fixture=scene(); await seed(page,[{id:"global",edits:fixture.edits,dirty:true}],fixture.assets);
  await selectObject(page,"alpha",fixture.edits);
  const fill=page.getByRole("button",{name:"Remplissage",exact:true});
  await fill.focus(); await page.keyboard.press("Enter");
  const palette=page.getByRole("dialog",{name:"Remplissage palette",exact:true});
  await expect(palette.getByRole("button").first()).toBeFocused();
  await page.keyboard.press("Escape"); await expect(fill).toBeFocused();
  await expect(palette).toHaveCount(0);
  const slider=page.getByLabel("Opacité de la forme",{exact:true}); await slider.focus();
  await page.keyboard.press("Home"); await expect(slider).toHaveValue("0");
  await page.keyboard.press("End"); await expect(slider).toHaveValue("100");
  const save=page.getByRole("button",{name:"Enregistrer sous…",exact:true}); await save.focus(); await page.keyboard.press("Space");
  const dialog=page.getByRole("dialog",{name:"Enregistrer sous",exact:true});
  await expect(dialog.getByLabel("Nom du fichier")).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button",{name:"Enregistrer",exact:true})).toBeFocused();
  await page.keyboard.press("Tab"); await expect(dialog.getByLabel("Nom du fichier")).toBeFocused();
  await dialog.getByLabel("Nom du fichier").fill("synthetic typed name");
  await page.keyboard.press("Control+z"); await expect(page.locator(".pdf-edit-object")).toHaveCount(fixture.edits.length);
  await page.keyboard.press("Escape"); await expect(save).toBeFocused();
});

test("A11Y-008 modale Save As : Tab circulaire et retour au déclencheur",async({page})=>{
  const fixture=scene(); await seed(page,[{id:"global",edits:fixture.edits,dirty:true}],fixture.assets);
  const save=page.getByRole("button",{name:"Enregistrer sous…",exact:true}); await save.focus(); await page.keyboard.press("Enter");
  const dialog=page.getByRole("dialog",{name:"Enregistrer sous",exact:true});
  await expect(dialog.getByLabel("Nom du fichier")).toBeFocused();
  await page.keyboard.press("Shift+Tab"); await expect(dialog.getByRole("button",{name:"Enregistrer",exact:true})).toBeFocused();
  await page.keyboard.press("Escape"); await expect(save).toBeFocused();
});

test("A11Y-008 menu clavier et présentation : Escape restitue le focus",async({page})=>{
  const fixture=scene();await seed(page,[{id:"global",edits:fixture.edits}],fixture.assets);
  const trigger=page.getByRole("button",{name:"Fichier",exact:true});await trigger.focus();await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu",{name:"Fichier",exact:true}).getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
  await page.getByLabel("Mode d'affichage").selectOption("presentation");
  await expect(page.locator('.viewer [data-page-buffer="front"][data-render-state="ready"]')).toHaveCount(1);
  await page.keyboard.press("Escape");await expect(page.getByLabel("Mode d'affichage")).toHaveValue("single-page");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe("BODY");
});


test("A11Y-008 focus visible et état disabled mesurés en sombre",async({page},info)=>{
  const fixture=scene();await seed(page,[{id:"global",edits:fixture.edits}],fixture.assets);
  await page.getByRole("switch",{name:"Basculer le thème"}).click();
  const redo=page.getByRole("button",{name:"Rétablir",exact:true});await expect(redo).toBeDisabled();
  const disabled=await contrast(redo);
  await page.getByRole("button",{name:"Fichier",exact:true}).focus();await page.keyboard.press("Tab");
  const focused=page.locator(":focus");const focus=await contrast(focused);
  expect(focus.outlineStyle).not.toBe("none");expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
  expect(focus.ringRatio).toBeGreaterThanOrEqual(3);
  await info.attach("dark-disabled-focus",{body:JSON.stringify({disabled,focus,disabledWcagExempt:true},null,2),contentType:"application/json"});
});

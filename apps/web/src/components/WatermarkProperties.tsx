import { WatermarkPatternControls } from "./WatermarkPatternControls";
import { layoutWatermarkTiles } from "../editing/watermarkTiling";
import type { StampEdit } from "../editing/types";
import { layoutStamp } from "../editing/stampLayout";
import { PropertySlider } from "./PropertySlider";

export function WatermarkProperties({ edit, onUpdate, onFinish }: { edit: StampEdit; onUpdate: (edit: StampEdit, key?: string) => void; onFinish: (key: string) => void }) {
  const layout = layoutStamp(edit, edit.rect.x1 - edit.rect.x0, edit.rect.y1 - edit.rect.y0);
  let patternError = "", count = 0;
  if (edit.watermarkMode === "tiled") {
    try { count = layoutWatermarkTiles(edit, edit.rect.x1 - edit.rect.x0, edit.rect.y1 - edit.rect.y0).count; }
    catch (error) { patternError = error instanceof Error ? error.message : "Motif invalide."; }
  }
  return <>
    <WatermarkPatternControls value={edit} onChange={(patch, key) => onUpdate({ ...edit, ...patch }, key)} onFinish={onFinish} />
    {edit.watermarkMode === "tiled" ? <>
      {patternError ? <p role="alert">{patternError}</p> : <output aria-label="Répétitions du filigrane">{count} répétitions calculées (bords inclus)</output>}
      {count > 400 ? <p role="status">Motif dense : le rendu et l’export peuvent être plus lents.</p> : null}
      <p>Déplacez le motif entier sur la page ou ajustez sa phase. Les réglages concernent toutes les pages du groupe.</p>
    </> : <>
    <label>Taille du filigrane<select aria-label="Mode de taille du filigrane" value={edit.fontSizeMode ?? "fit"} onChange={(event) => onUpdate({ ...edit, fontSizeMode: event.target.value as StampEdit["fontSizeMode"], ...(event.target.value === "manual" ? { fontSize: Math.min(144, Math.max(6, layout.fontSize)) } : {}) })}><option value="fit">Adapter à la page</option><option value="manual">Taille manuelle</option></select></label>
    <output aria-label="Taille calculée du filigrane">{layout.fontSize.toFixed(1)} pt</output>
    {layout.overflow ? <p role="alert">Filigrane hors cadre ou caractère non pris en charge : adaptez la taille avant export.</p> : null}
    <PropertySlider label="Échelle du filigrane" value={(edit.watermarkScale ?? 0.9) * 100} min={10} max={100} step={1} unit="%" color={edit.color} previewLabel="Échelle" onChange={(value) => onUpdate({ ...edit, watermarkScale: value / 100 }, "watermarkScale")} onCommit={() => onFinish("watermarkScale")} />
    {(["offsetX", "offsetY"] as const).map((field) => <PropertySlider key={field} label={`Décalage ${field === "offsetX" ? "X" : "Y"} du filigrane`} value={(edit[field] ?? 0) * 100} min={-40} max={40} step={1} unit="%" color={edit.color} previewLabel="Position" onChange={(value) => onUpdate({ ...edit, [field]: value / 100 }, field)} onCommit={() => onFinish(field)} />)}
    <div>{[-45, 0, 45].map((rotation) => <button key={rotation} type="button" onClick={() => onUpdate({ ...edit, rotation })}>{rotation}°</button>)}</div>
    <p>Position réglée par décalages relatifs à la page. L’échelle concerne le mode automatique ; les modifications s’appliquent au groupe. Le texte original reste récupérable.</p>
    </>}
  </>;
}

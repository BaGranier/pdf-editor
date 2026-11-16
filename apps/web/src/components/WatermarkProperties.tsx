import type { StampEdit } from "../editing/types";
import { layoutStamp } from "../editing/stampLayout";
import { PropertySlider } from "./PropertySlider";

export function WatermarkProperties({ edit, onUpdate, onFinish }: { edit: StampEdit; onUpdate: (edit: StampEdit, key?: string) => void; onFinish: (key: string) => void }) {
  const layout = layoutStamp(edit, edit.rect.x1 - edit.rect.x0, edit.rect.y1 - edit.rect.y0);
  return <>
    <label>Taille du filigrane<select aria-label="Mode de taille du filigrane" value={edit.fontSizeMode ?? "fit"} onChange={(event) => onUpdate({ ...edit, fontSizeMode: event.target.value as StampEdit["fontSizeMode"], ...(event.target.value === "manual" ? { fontSize: Math.min(144, Math.max(6, layout.fontSize)) } : {}) })}><option value="fit">Adapter à la page</option><option value="manual">Taille manuelle</option></select></label>
    <output aria-label="Taille calculée du filigrane">{layout.fontSize.toFixed(1)} pt</output>
    {layout.overflow ? <p role="alert">Filigrane hors cadre ou caractère non pris en charge : adaptez la taille avant export.</p> : null}
    <PropertySlider label="Échelle du filigrane" value={(edit.watermarkScale ?? 0.9) * 100} min={10} max={100} step={1} unit="%" color={edit.color} previewLabel="Échelle" onChange={(value) => onUpdate({ ...edit, watermarkScale: value / 100 }, "watermarkScale")} onCommit={() => onFinish("watermarkScale")} />
    {(["offsetX", "offsetY"] as const).map((field) => <PropertySlider key={field} label={`Décalage ${field === "offsetX" ? "X" : "Y"} du filigrane`} value={(edit[field] ?? 0) * 100} min={-40} max={40} step={1} unit="%" color={edit.color} previewLabel="Position" onChange={(value) => onUpdate({ ...edit, [field]: value / 100 }, field)} onCommit={() => onFinish(field)} />)}
    <div>{[-45, 0, 45].map((rotation) => <button key={rotation} type="button" onClick={() => onUpdate({ ...edit, rotation })}>{rotation}°</button>)}</div>
    <p>Position réglée par décalages relatifs à la page. L’échelle concerne le mode automatique ; les modifications s’appliquent au groupe. Le texte original reste récupérable.</p>
  </>;
}

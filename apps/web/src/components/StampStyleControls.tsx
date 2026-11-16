import type { StampEdit } from "../editing/types";
import { layoutStamp } from "../editing/stampLayout";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

type Props = { edit: StampEdit; onUpdate: (edit: StampEdit, key?: string) => void; onFinish: (key: string) => void };
export function StampStyleControls({ edit, onUpdate, onFinish }: Props) {
  if (edit.imageId) return null;
  if (edit.layoutVersion !== 2) return <button type="button" onClick={() => onUpdate({ ...edit, layoutVersion: 2, fontSizeMode: "fit", linkedColors: true, fillOpacity: 0.1 })}>Adopter le style harmonisé et la taille automatique</button>;
  const layout = layoutStamp(edit, edit.rect.x1 - edit.rect.x0, edit.rect.y1 - edit.rect.y0);
  const numbers = [
    ["fillOpacity", "Opacité du fond", 0, 100, 1, 100, "%", edit.fillOpacity ?? 0],
    ["textOpacity", "Opacité du texte", 0, 100, 1, 100, "%", edit.textOpacity ?? 1],
    ["borderOpacity", "Opacité de la bordure", 0, 100, 1, 100, "%", edit.borderOpacity ?? 1],
    ["borderWidth", "Épaisseur de la bordure", 0, 12, 0.5, 1, "pt", edit.borderWidth ?? 2],
    ["paddingRatio", "Marge interne", 0, 40, 1, 100, "%", edit.paddingRatio ?? 0.1],
  ] as const;
  return <>
    <label>Taille du texte<select aria-label="Mode de taille du tampon" value={edit.fontSizeMode ?? "manual"} onChange={(event) => onUpdate({ ...edit, fontSizeMode: event.target.value as StampEdit["fontSizeMode"] })}><option value="fit">Taille automatique / Adapter au cadre</option><option value="manual">Taille manuelle</option></select></label>
    <output aria-label="Taille calculée du tampon">{layout.fontSize.toFixed(1)} pt</output>
    {layout.overflow ? <p role="alert">Le texte dépasse le cadre ou contient un caractère non pris en charge. L’export sera refusé ; adaptez le texte ou activez la taille automatique.</p> : null}
    <label><input type="checkbox" checked={edit.linkedColors ?? true} onChange={(event) => onUpdate({ ...edit, linkedColors: event.target.checked })} />Lier texte, bordure et fond</label>
    <label><input type="checkbox" checked={(edit.fillOpacity ?? 0) === 0} onChange={(event) => onUpdate({ ...edit, fillOpacity: event.target.checked ? 0 : 0.1 })} />Aucun fond</label>
    <details><summary>Style avancé du tampon</summary>
      {edit.linkedColors === false ? <>
        <ColorPicker label="Couleur du texte" value={edit.textColor ?? edit.color} onChange={(textColor) => onUpdate({ ...edit, textColor })} />
        <ColorPicker label="Couleur de la bordure" value={edit.borderColor ?? edit.color} onChange={(borderColor) => onUpdate({ ...edit, borderColor })} />
        <ColorPicker label="Couleur du fond" value={edit.fillColor ?? edit.color} onChange={(fillColor) => onUpdate({ ...edit, fillColor })} />
      </> : null}
      {numbers.map(([field, label, min, max, step, factor, unit, value]) => <PropertySlider key={field} label={label} value={value * factor} min={min} max={max} step={step} unit={unit} color={edit.color} previewLabel={label} onChange={(value) => onUpdate({ ...edit, [field]: value / factor }, field)} onCommit={() => onFinish(field)} />)}
    </details>
  </>;
}

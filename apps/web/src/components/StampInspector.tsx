import type { StampEdit } from "../editing/types";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

export function StampInspector({ edit, onUpdate, onFinish, onDelete }: { edit: StampEdit; onUpdate: (edit: StampEdit, key?: string) => void; onFinish: (key: string) => void; onDelete: () => void }) {
  return <section className="shape-edit-toolbar" aria-label="Propriétés du tampon">
    <strong>Tampon visuel</strong>
    <p>Ce marquage ne constitue pas une signature électronique ni une certification.</p>
    {!edit.imageId ? <>
      <label>Libellé du tampon<textarea aria-label="Libellé du tampon" maxLength={200} value={edit.text} onChange={(event) => onUpdate({ ...edit, text: event.target.value }, "text")} onBlur={() => onFinish("text")} /></label>
      <label>Alignement du tampon<select aria-label="Alignement du tampon" value={edit.align ?? "center"} onChange={(event) => onUpdate({ ...edit, align: event.target.value as StampEdit["align"] })}><option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option></select></label>
      <label>Police du tampon<select aria-label="Police du tampon" value={edit.fontFamily} onChange={(event) => onUpdate({ ...edit, fontFamily: event.target.value as StampEdit["fontFamily"] })}>{["Helvetica", "Times", "Courier"].map((font) => <option key={font}>{font}</option>)}</select></label>
      <p>Polices PDF standard, caractères Latin-1 (sans € ni Œ) ; repli écran Arial, Times New Roman ou Courier New.</p>
      <PropertySlider label="Taille du texte du tampon" value={edit.fontSize} min={6} max={144} step={1} unit="pt" color={edit.color} previewLabel="Taille du texte" onChange={(fontSize) => onUpdate({ ...edit, fontSize }, "fontSize")} onCommit={() => onFinish("fontSize")} />
    </> : null}
    <ColorPicker label="Couleur du tampon" value={edit.color} onChange={(color) => onUpdate({ ...edit, color })} />
    <PropertySlider label="Rotation du tampon" value={edit.rotation} min={-180} max={180} step={1} unit="°" color={edit.color} previewLabel="Rotation" onChange={(rotation) => onUpdate({ ...edit, rotation }, "rotation")} onCommit={() => onFinish("rotation")} />
    <PropertySlider label="Opacité du tampon" value={Math.round(edit.opacity * 100)} min={0} max={100} step={1} unit="%" color={edit.color} opacity={edit.opacity} previewLabel="Opacité" onChange={(opacity) => onUpdate({ ...edit, opacity: opacity / 100 }, "opacity")} onCommit={() => onFinish("opacity")} />
    <label><input type="checkbox" checked={edit.border} onChange={(event) => onUpdate({ ...edit, border: event.target.checked })} />Cadre du tampon</label>
    <p>Déplacez et redimensionnez avec les poignées sur la page. Le contenu tourné reste dans son cadre. La date insérée reste figée.</p>
    <button type="button" onClick={onDelete}>Supprimer le tampon</button>
  </section>;
}

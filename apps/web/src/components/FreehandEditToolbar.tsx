import type { FreehandEdit } from "../editing/types";
import { ColorPicker } from "./ColorPicker";

export function FreehandEditToolbar({ edit, onUpdate, onDelete }: { edit: FreehandEdit; onUpdate: (patch: Partial<FreehandEdit>) => void; onDelete: () => void }) {
  return <section className="shape-edit-toolbar" aria-label="Propriétés du dessin">
    <ColorPicker label="Couleur du dessin" value={edit.style.color} onChange={(color) => onUpdate({ style: { ...edit.style, color } })} />
    <label>Épaisseur<input type="number" aria-label="Épaisseur du dessin" min="0.5" max="50" step="0.5" value={edit.style.strokeWidth} onChange={(event) => { const strokeWidth = Number(event.target.value); if (Number.isFinite(strokeWidth) && strokeWidth >= .5 && strokeWidth <= 50) onUpdate({ style: { ...edit.style, strokeWidth } }); }} /></label>
    <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>Supprimer le dessin</button>
  </section>;
}

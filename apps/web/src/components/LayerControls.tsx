import type { PdfEdit } from "../editing/types";
import { isLayerObject, layerLabel, type LayerDirection } from "../editing/layers";

type Props = {
  edits: PdfEdit[];
  page: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (id: string, direction: LayerDirection) => void;
};
const actions = [ ["front", "Mettre au premier plan"], ["back", "Mettre au dernier plan"], ["forward", "Avancer d’un plan"], ["backward", "Reculer d’un plan"] ] as const;
export function LayerControls({ edits, page, selectedId, onSelect, onReorder }: Props) {
  const objects = edits.filter(isLayerObject).filter((edit) => edit.page === page);
  const selectedIndex = objects.findIndex((edit) => edit.id === selectedId);
  return <>
    {selectedIndex >= 0 && selectedId ? <section className="layer-controls" aria-label="Ordre des plans">
      {actions.map(([direction, label]) => <button key={direction} type="button" disabled={direction === "front" || direction === "forward" ? selectedIndex === objects.length - 1 : selectedIndex === 0} onClick={() => onReorder(selectedId, direction)}>{label}</button>)}
    </section> : null}
    {objects.length ? <section className="layer-controls" aria-label="Objets de la page">
      <strong>Objets · du premier au dernier plan</strong>
      {objects.slice().reverse().map((edit, index) => <button key={edit.id} type="button" aria-pressed={selectedId === edit.id} onClick={() => onSelect(edit.id)}>{layerLabel(edit)} · {index + 1}</button>)}
    </section> : null}
  </>;
}

import type { FreehandEdit, FreehandStyle } from "../editing/types";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

type FreehandEditToolbarProps = {
  edit: FreehandEdit;
  onUpdate: (patch: Partial<FreehandEdit>, coalesceKey?: string) => void;
  onFinishUpdate: (coalesceKey: string) => void;
  onDelete?: () => void;
};

export function getFreehandOpacity(style: Pick<FreehandStyle, "opacity"> | { opacity?: number }) {
  return Math.min(1, Math.max(0, style.opacity ?? 1));
}

export function FreehandEditToolbar({
  edit,
  onUpdate,
  onFinishUpdate,
  onDelete,
}: FreehandEditToolbarProps) {
  const opacity = getFreehandOpacity(edit.style);
  const opacityPercent = Math.round(opacity * 100);
  const updateStyle = (style: FreehandStyle, coalesceKey?: string) => onUpdate({ style }, coalesceKey);

  return (
    <section className="shape-edit-toolbar" aria-label="Propriétés du dessin">
      <strong>Dessin</strong>
      <ColorPicker
        label="Couleur du dessin"
        value={edit.style.color}
        onChange={(color) => updateStyle({ ...edit.style, color, opacity })}
      />
      <PropertySlider
        label="Épaisseur du dessin"
        value={edit.style.strokeWidth}
        min={1}
        max={20}
        step={1}
        unit="pt"
        color={edit.style.color}
        opacity={opacity}
        previewLabel={`Aperçu du dessin ${edit.style.strokeWidth} pt`}
        onChange={(strokeWidth) => updateStyle({ ...edit.style, strokeWidth, opacity }, "stroke-width")}
        onCommit={() => onFinishUpdate("stroke-width")}
      />
      <PropertySlider
        label="Opacité du dessin"
        value={opacityPercent}
        min={0}
        max={100}
        step={1}
        unit="%"
        color={edit.style.color}
        opacity={opacity}
        previewThickness={edit.style.strokeWidth}
        previewLabel={`Aperçu du dessin à ${opacityPercent} % d’opacité`}
        onChange={(nextPercent) => updateStyle({ ...edit.style, opacity: nextPercent / 100 }, "opacity")}
        onCommit={() => onFinishUpdate("opacity")}
      />
      {onDelete ? (
        <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>
          Supprimer le dessin
        </button>
      ) : null}
    </section>
  );
}

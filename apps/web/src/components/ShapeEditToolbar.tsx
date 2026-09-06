import { useRef } from "react";
import { SHAPE_TYPES, type ShapeEdit, type ShapeType } from "../editing/types";

type ShapeEditToolbarProps = {
  edit: ShapeEdit;
  eyedropperTarget: "stroke" | "fill" | null;
  onUpdate: (patch: Partial<ShapeEdit>) => void;
  onPickColor: (target: "stroke" | "fill") => void;
  onDelete: () => void;
};

const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  line: "Ligne",
};

export function ShapeEditToolbar({
  edit,
  eyedropperTarget,
  onUpdate,
  onPickColor,
  onDelete,
}: ShapeEditToolbarProps) {
  const supportsFill = edit.shapeType !== "line";
  const lastFillColor = useRef(edit.style.fillColor ?? "#dbeafe");
  if (edit.style.fillColor !== null) {
    lastFillColor.current = edit.style.fillColor;
  }

  return (
    <section className="shape-edit-toolbar" aria-label="Propriétés de la forme">
      <label>
        Type
        <select
          aria-label="Type de forme"
          value={edit.shapeType}
          onChange={(event) => {
            const shapeType = event.target.value as ShapeType;
            onUpdate({
              shapeType,
              style: {
                ...edit.style,
                fillColor: shapeType === "line" ? null : edit.style.fillColor,
              },
            });
          }}
        >
          {SHAPE_TYPES.map((shapeType) => (
            <option key={shapeType} value={shapeType}>
              {SHAPE_LABELS[shapeType]}
            </option>
          ))}
        </select>
      </label>
      <label className="shape-edit-toolbar__color-control">
        Contour
        <span><input type="color" aria-label="Couleur du contour" value={edit.style.strokeColor} onChange={(event) => onUpdate({ style: { ...edit.style, strokeColor: event.target.value } })} />
          <button type="button" className="shape-edit-toolbar__eyedropper" aria-label="Pipette contour" title="Prélever une couleur" aria-pressed={eyedropperTarget === "stroke"} onClick={() => onPickColor("stroke")}>◉</button>
        </span>
      </label>
      <label>
        Épaisseur
        <input
          type="number"
          aria-label="Épaisseur du contour"
          min="0.5"
          max="50"
          step="0.5"
          value={edit.style.strokeWidth}
          onChange={(event) => {
            const strokeWidth = Number(event.target.value);
            if (Number.isFinite(strokeWidth) && strokeWidth >= 0.5 && strokeWidth <= 50) {
              onUpdate({ style: { ...edit.style, strokeWidth } });
            }
          }}
        />
      </label>
      {supportsFill ? (
        <>
          <label className="shape-edit-toolbar__color-control">
            Remplissage
            <span><input type="color" aria-label="Couleur de remplissage" disabled={edit.style.fillColor === null} value={edit.style.fillColor ?? lastFillColor.current} onChange={(event) => onUpdate({ style: { ...edit.style, fillColor: event.target.value } })} />
              <button type="button" className="shape-edit-toolbar__eyedropper" aria-label="Pipette remplissage" title="Prélever une couleur" aria-pressed={eyedropperTarget === "fill"} disabled={edit.style.fillColor === null} onClick={() => onPickColor("fill")}>◉</button>
            </span>
          </label>
          <label className="shape-edit-toolbar__transparent"><input type="checkbox" aria-label="Remplissage transparent" checked={edit.style.fillColor === null} onChange={(event) => onUpdate({ style: { ...edit.style, fillColor: event.target.checked ? null : lastFillColor.current } })} /> Transparent</label>
        </>
      ) : null}
      <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>
        Supprimer la forme
      </button>
    </section>
  );
}

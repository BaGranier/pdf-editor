import { useRef } from "react";
import { SHAPE_TYPES, type ShapeEdit, type ShapeType } from "../editing/types";
import { ColorPicker } from "./ColorPicker";

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
      <ColorPicker label="Contour" value={edit.style.strokeColor} onChange={(strokeColor) => onUpdate({ style: { ...edit.style, strokeColor } })} onPickColor={() => onPickColor("stroke")} eyedropperActive={eyedropperTarget === "stroke"} />
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
          <ColorPicker label="Remplissage" value={edit.style.fillColor ?? lastFillColor.current} disabled={edit.style.fillColor === null} onChange={(fillColor) => onUpdate({ style: { ...edit.style, fillColor } })} onPickColor={() => onPickColor("fill")} eyedropperActive={eyedropperTarget === "fill"} />
          <label className="shape-edit-toolbar__transparent"><input type="checkbox" aria-label="Remplissage transparent" checked={edit.style.fillColor === null} onChange={(event) => onUpdate({ style: { ...edit.style, fillColor: event.target.checked ? null : lastFillColor.current } })} /> Transparent</label>
        </>
      ) : null}
      <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>
        Supprimer la forme
      </button>
    </section>
  );
}

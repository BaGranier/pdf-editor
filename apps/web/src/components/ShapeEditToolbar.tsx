import { useRef } from "react";
import { SHAPE_TYPES, type ShapeEdit, type ShapeType } from "../editing/types";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

type ShapeEditToolbarProps = {
  edit: ShapeEdit;
  eyedropperTarget: "stroke" | "fill" | null;
  onUpdate: (patch: Partial<ShapeEdit>, coalesceKey?: string) => void;
  onFinishUpdate: (coalesceKey: string) => void;
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
  onFinishUpdate,
  onPickColor,
  onDelete,
}: ShapeEditToolbarProps) {
  const supportsFill = edit.shapeType !== "line";
  const opacity = Math.min(1, Math.max(0, edit.style.opacity ?? 1));
  const opacityPercent = Math.round(opacity * 100);
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
      <PropertySlider
        label="Épaisseur du contour"
        value={edit.style.strokeWidth}
        min={1}
        max={20}
        step={1}
        unit="pt"
        color={edit.style.strokeColor}
        previewLabel={`Aperçu du contour ${edit.style.strokeWidth} pt`}
        onChange={(strokeWidth) => onUpdate({ style: { ...edit.style, strokeWidth } }, "stroke-width")}
        onCommit={() => onFinishUpdate("stroke-width")}
      />
      {supportsFill ? (
        <>
          <ColorPicker label="Remplissage" value={edit.style.fillColor ?? lastFillColor.current} disabled={edit.style.fillColor === null} onChange={(fillColor) => onUpdate({ style: { ...edit.style, fillColor } })} onPickColor={() => onPickColor("fill")} eyedropperActive={eyedropperTarget === "fill"} />
          <label className="shape-edit-toolbar__transparent"><input type="checkbox" aria-label="Remplissage transparent" checked={edit.style.fillColor === null} onChange={(event) => onUpdate({ style: { ...edit.style, fillColor: event.target.checked ? null : lastFillColor.current } })} /> Transparent</label>
        </>
      ) : null}
      <PropertySlider
        label="Opacité de la forme"
        value={opacityPercent}
        min={0}
        max={100}
        step={1}
        unit="%"
        color={edit.style.strokeColor}
        opacity={opacity}
        previewThickness={edit.style.strokeWidth}
        previewKind={edit.shapeType === "line" ? "line" : "shape"}
        previewFillColor={edit.style.fillColor}
        previewLabel={`Aperçu de la forme à ${opacityPercent} % d’opacité`}
        onChange={(nextPercent) => onUpdate({ style: { ...edit.style, opacity: nextPercent / 100 } }, "opacity")}
        onCommit={() => onFinishUpdate("opacity")}
      />
      <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>
        Supprimer la forme
      </button>
    </section>
  );
}

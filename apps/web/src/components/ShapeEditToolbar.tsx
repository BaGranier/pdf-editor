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
      <label>
        Contour
        <input
          type="color"
          aria-label="Couleur du contour"
          value={edit.style.strokeColor}
          onChange={(event) =>
            onUpdate({
              style: { ...edit.style, strokeColor: event.target.value },
            })
          }
        />
      </label>
      <button
        type="button"
        aria-label="Pipette contour"
        aria-pressed={eyedropperTarget === "stroke"}
        onClick={() => onPickColor("stroke")}
      >
        Pipette
      </button>
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
          <label>
            <input
              type="checkbox"
              aria-label="Remplissage transparent"
              checked={edit.style.fillColor === null}
              onChange={(event) =>
                onUpdate({
                  style: {
                    ...edit.style,
                    fillColor: event.target.checked ? null : "#dbeafe",
                  },
                })
              }
            />
            Transparent
          </label>
          <label>
            Remplissage
            <input
              type="color"
              aria-label="Couleur de remplissage"
              disabled={edit.style.fillColor === null}
              value={edit.style.fillColor ?? "#dbeafe"}
              onChange={(event) =>
                onUpdate({
                  style: { ...edit.style, fillColor: event.target.value },
                })
              }
            />
          </label>
          <button
            type="button"
            aria-label="Pipette remplissage"
            aria-pressed={eyedropperTarget === "fill"}
            disabled={edit.style.fillColor === null}
            onClick={() => onPickColor("fill")}
          >
            Pipette
          </button>
        </>
      ) : null}
      <button type="button" className="shape-edit-toolbar__delete" onClick={onDelete}>
        Supprimer la forme
      </button>
    </section>
  );
}

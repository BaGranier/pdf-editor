import {
  TEXT_FONT_FAMILIES,
  type AddTextEdit,
  type TextFontFamily,
} from "../editing/types";

type TextEditToolbarProps = {
  edit: AddTextEdit;
  onUpdate: (patch: Partial<AddTextEdit>) => void;
  onDelete: () => void;
};

export function TextEditToolbar({ edit, onUpdate, onDelete }: TextEditToolbarProps) {
  return (
    <section className="text-edit-toolbar" aria-label="Propriétés du texte ajouté">
      <label>
        Police
        <select
          aria-label="Police du texte"
          value={edit.style.fontFamily}
          onChange={(event) =>
            onUpdate({
              style: {
                ...edit.style,
                fontFamily: event.target.value as TextFontFamily,
              },
            })
          }
        >
          {TEXT_FONT_FAMILIES.map((fontFamily) => (
            <option key={fontFamily} value={fontFamily}>
              {fontFamily}
            </option>
          ))}
        </select>
      </label>
      <label>
        Taille
        <input
          aria-label="Taille du texte"
          type="number"
          min="6"
          max="144"
          step="1"
          value={edit.style.fontSize}
          onChange={(event) => {
            const fontSize = Number(event.target.value);

            if (Number.isFinite(fontSize) && fontSize >= 6 && fontSize <= 144) {
              onUpdate({ style: { ...edit.style, fontSize } });
            }
          }}
        />
      </label>
      <label>
        Couleur
        <input
          aria-label="Couleur du texte"
          type="color"
          value={edit.style.color}
          onChange={(event) =>
            onUpdate({ style: { ...edit.style, color: event.target.value } })
          }
        />
      </label>
      <button
        type="button"
        aria-label="Gras"
        aria-pressed={edit.style.bold}
        onClick={() =>
          onUpdate({ style: { ...edit.style, bold: !edit.style.bold } })
        }
      >
        <strong>G</strong>
      </button>
      <button type="button" className="text-edit-toolbar__delete" onClick={onDelete}>
        Supprimer le bloc
      </button>
    </section>
  );
}

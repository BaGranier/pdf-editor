import type { AddTextEdit, NativeTextEdit } from "../editing/types";
import { ColorPicker } from "./ColorPicker";
import { FontSelector } from "./FontSelector";
import { resolveFontRef } from "../fonts/catalog";

type TextEditToolbarProps = {
  edit: AddTextEdit | NativeTextEdit;
  onUpdate: (patch: Partial<AddTextEdit | NativeTextEdit>) => void;
  onDelete: () => void;
  onLibraryChange?: () => void;
};

export function TextEditToolbar({ edit, onUpdate, onDelete, onLibraryChange }: TextEditToolbarProps) {
  const fontRef = resolveFontRef(edit.style);
  const supportsVariants = fontRef.startsWith("pdf-standard:");
  return (
    <section className="text-edit-toolbar" aria-label={edit.type === "native_text" ? "Propriétés du texte PDF" : "Propriétés du texte ajouté"}>
      <FontSelector
        style={edit.style}
        documentFontName={edit.type === "native_text" ? edit.source.sourceFontName : undefined}
        onLibraryChange={onLibraryChange}
        onChange={(font) => onUpdate({ style: { ...edit.style, fontFamily: font.family, fontRef: font.id, bold: font.weight >= 700, fontStyle: font.style }, ...(edit.type === "native_text" ? { fontFallbackReason: undefined } : {}) })}
      />
      {edit.type === "native_text" && edit.fontFallbackReason ? <p className="font-selector__warning" role="status">{edit.fontFallbackReason}</p> : null}
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
              onUpdate({ style: { ...edit.style, fontSize }, autoSize: false });
            }
          }}
        />
      </label>
      <ColorPicker label="Couleur du texte" value={edit.style.color} onChange={(color) => onUpdate({ style: { ...edit.style, color } })} />
      <button
        type="button"
        aria-label="Gras"
        aria-pressed={edit.style.bold}
        disabled={!supportsVariants}
        onClick={() =>
          onUpdate({ style: { ...edit.style, bold: !edit.style.bold } })
        }
      >
        <strong>G</strong>
      </button>
      <button
        type="button"
        aria-label="Italique"
        aria-pressed={edit.style.fontStyle === "italic"}
        disabled={!supportsVariants}
        onClick={() => onUpdate({ style: { ...edit.style, fontStyle: edit.style.fontStyle === "italic" ? "normal" : "italic" } })}
      >
        <em>I</em>
      </button>
      <button type="button" className="text-edit-toolbar__delete" onClick={onDelete}>
        {edit.type === "native_text" ? "Annuler le remplacement" : "Supprimer le bloc"}
      </button>
    </section>
  );
}

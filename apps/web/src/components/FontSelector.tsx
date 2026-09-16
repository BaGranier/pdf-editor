import { useEffect, useRef, useState } from "react";
import { BUNDLED_FONTS, PDF_STANDARD_FONTS, resolveFontRef, type FontFaceDescriptor } from "../fonts/catalog";
import { fontRegistry, type CustomFontRecord } from "../fonts/fontRegistry";
import type { AddTextStyle } from "../editing/types";

type Props = {
  style: AddTextStyle;
  documentFontName?: string;
  onChange: (font: FontFaceDescriptor | CustomFontRecord) => void;
  onLibraryChange?: () => void;
};

export function FontSelector({ style, documentFontName, onChange, onLibraryChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFontRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = () => void fontRegistry.listCustom().then(setCustomFonts);
  useEffect(refresh, []);
  const selectedRef = resolveFontRef(style);
  const documentFont: FontFaceDescriptor | null = documentFontName ? {
    id: selectedRef.startsWith("document:") ? selectedRef : `document:${documentFontName}`,
    family: documentFontName, displayName: documentFontName, source: "document",
    category: "sans-serif", weight: style.bold ? 700 : 400,
    style: style.fontStyle ?? "normal", embeddable: true,
  } : null;
  const all = [...(documentFont ? [documentFont] : []), ...PDF_STANDARD_FONTS, ...BUNDLED_FONTS, ...customFonts];

  return (
    <div className="font-selector">
      <label>
        Police
        <select
          aria-label="Police du texte"
          value={selectedRef}
          onChange={(event) => {
            const font = all.find((candidate) => candidate.id === event.target.value);
            if (!font) return;
            void fontRegistry.ensureLoaded(font.id).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Police indisponible."));
            onChange(font);
          }}
        >
          {documentFont ? <optgroup label="Police du document"><option value={documentFont.id}>{documentFont.displayName}</option></optgroup> : null}
          <optgroup label="Polices PDF standard">{PDF_STANDARD_FONTS.filter((font) => font.weight === 400).map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup>
          <optgroup label="Polices intégrées">{BUNDLED_FONTS.map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup>
          {customFonts.length ? <optgroup label="Polices personnalisées">{customFonts.map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup> : null}
        </select>
      </label>
      <button type="button" onClick={() => inputRef.current?.click()}>+ Ajouter une police…</button>
      <input
        ref={inputRef}
        className="visually-hidden"
        aria-label="Importer une police TTF ou OTF"
        type="file"
        accept=".ttf,.otf,font/ttf,font/otf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (!file) return;
          void fontRegistry.importCustom(file).then(async ({ font, duplicate }) => {
            await fontRegistry.ensureLoaded(font.id);
            refresh();
            onLibraryChange?.();
            setMessage(duplicate ? "Cette police est déjà dans la bibliothèque." : "Police ajoutée à la bibliothèque locale.");
          }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "La police n'a pas pu être ajoutée."));
        }}
      />
      {customFonts.length ? (
        <details className="font-selector__library">
          <summary>Gérer les polices personnalisées</summary>
          <ul>
            {customFonts.map((font) => {
              const inUse = font.id === selectedRef;
              return <li key={font.id}>
                <span style={{ fontFamily: font.family }}>{font.displayName}</span>
                <button
                  type="button"
                  disabled={inUse}
                  title={inUse ? "Choisissez une autre police avant de supprimer celle-ci." : "Supprimer de la bibliothèque locale"}
                  onClick={() => void fontRegistry.removeCustom(font.id).then(() => { refresh(); onLibraryChange?.(); setMessage("Police supprimée de la bibliothèque locale."); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Suppression impossible."))}
                >Supprimer</button>
              </li>;
            })}
          </ul>
        </details>
      ) : null}
      {message ? <p className="font-selector__message" role="status">{message}</p> : null}
    </div>
  );
}

import { useLocale } from "../viewer/locale";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { floatingPortalTarget, useFloatingPosition } from "../hooks/useFloatingPosition";
import { usePopoverDismiss } from "../hooks/usePopoverDismiss";
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
  const { t: localize } = useLocale();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFontRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpPopoverRef = useRef<HTMLElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const refresh = () => void fontRegistry.listCustom().then(setCustomFonts);
  useEffect(refresh, []);
  const panelId = useId();
  useFloatingPosition(helpOpen, helpButtonRef, helpPopoverRef, "bottom-end", setHelpOpen);
  usePopoverDismiss(helpOpen, helpButtonRef, helpPopoverRef, setHelpOpen);
  useLayoutEffect(() => {
    if (helpOpen) helpPopoverRef.current?.focus({ preventScroll: true });
  }, [helpOpen]);
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
        {localize("Police")}
        <select
          aria-label={localize("Police du texte")}
          value={selectedRef}
          onChange={(event) => {
            const font = all.find((candidate) => candidate.id === event.target.value);
            if (!font) return;
            void fontRegistry.ensureLoaded(font.id).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Police indisponible."));
            onChange(font);
          }}
        >
          {documentFont ? <optgroup label={localize("Police du document")}><option value={documentFont.id}>{documentFont.displayName}</option></optgroup> : null}
          <optgroup label={localize("Polices PDF standard")}>{PDF_STANDARD_FONTS.filter((font) => font.weight === 400).map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup>
          <optgroup label={localize("Polices intégrées")}>{BUNDLED_FONTS.map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup>
          {customFonts.length ? <optgroup label={localize("Polices personnalisées")}>{customFonts.map((font) => <option key={font.id} value={font.id}>{font.displayName}</option>)}</optgroup> : null}
        </select>
      </label>
      <div className="font-selector__import-actions">
        <button type="button" onClick={() => inputRef.current?.click()}>{localize("+ Ajouter une police…")}</button>
        <button ref={helpButtonRef} type="button" className="font-selector__help" aria-label={localize("Comment ajouter une police personnalisée")} aria-haspopup="dialog" aria-expanded={helpOpen} aria-controls={helpOpen ? panelId : undefined} onClick={() => setHelpOpen((open) => !open)}>i</button>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        aria-label={localize("Importer une police TTF ou OTF")}
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
          <summary>{localize("Gérer les polices personnalisées")}</summary>
          <ul>
            {customFonts.map((font) => {
              const inUse = font.id === selectedRef;
              return <li key={font.id}>
                <span style={{ fontFamily: font.family }}>{font.displayName}</span>
                <button
                  type="button"
                  disabled={inUse}
                  title={inUse ? localize("Choisissez une autre police avant de supprimer celle-ci.") : localize("Supprimer de la bibliothèque locale")}
                  onClick={() => void fontRegistry.removeCustom(font.id).then(() => { refresh(); onLibraryChange?.(); setMessage("Police supprimée de la bibliothèque locale."); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Suppression impossible."))}
                >{localize("Supprimer")}</button>
              </li>;
            })}
          </ul>
        </details>
      ) : null}
      {message ? <p className="font-selector__message" role="status">{message}</p> : null}
      {helpOpen ? createPortal(
        <section ref={helpPopoverRef} id={panelId} className="floating-surface font-selector__help-popover" role="dialog" aria-label={localize("Ajouter une police personnalisée")} tabIndex={-1}>
          <strong>{localize("Ajouter une police personnalisée")}</strong>
          <p>{localize("Cliquez sur ")}<b>{localize("Ajouter une police…")}</b>{localize(", puis sélectionnez un fichier ")}<code>.ttf</code> ou <code>.otf</code>.</p>
          <p>{localize("La police est ajoutée à la bibliothèque locale de l’application et devient disponible pour l’aperçu et l’export PDF. Les polices installées sur votre ordinateur ne sont pas ajoutées automatiquement : importez leur fichier.")}</p>
          <p>{localize("Vérifiez que vous disposez des droits nécessaires pour utiliser et incorporer cette police dans un PDF.")}</p>
          <details><summary>{localize("Où trouver mes fichiers de police ?")}</summary><p>{localize("Windows : C:\\\\Windows\\\\Fonts")}<br />{localize("macOS : ~/Library/Fonts ou /Library/Fonts")}<br />{localize("Linux : ~/.local/share/fonts ou /usr/share/fonts")}</p></details>
        </section>,
        floatingPortalTarget(helpButtonRef.current),
      ) : null}
    </div>
  );
}

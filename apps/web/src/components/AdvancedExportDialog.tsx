import { useLocale } from "../viewer/locale";
import { useEffect, useRef, useState } from "react";
import { EXPORT_QUALITY_LABELS, type ExportOptions } from "../saving/exportOptions";

type Props = { busy: boolean; onCancel: () => void; onExport: (options: ExportOptions) => Promise<boolean> };
export function AdvancedExportDialog({ busy, onCancel, onExport }: Props) {
  const { t: localize } = useLocale();
  const [quality, setQuality] = useState<ExportOptions["quality"]>("maximum");
  const [flattenForms, setFlattenForms] = useState(false);
  const [flattenAnnotations, setFlattenAnnotations] = useState(false);
  const [openPassword, setOpenPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerConfirmation, setOwnerConfirmation] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowModification, setAllowModification] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>("select")?.focus();
    return () => previous?.focus();
  }, []);
  const submit = async () => {
    if (openPassword !== confirmation || ownerPassword !== ownerConfirmation) { setError("Les confirmations des mots de passe ne correspondent pas."); return; }
    if ([openPassword, ownerPassword].some((value) => new TextEncoder().encode(value).length > 40)) { setError("Chaque mot de passe est limité à 40 octets UTF-8."); return; }
    if ((!allowPrinting || !allowModification) && (!ownerPassword || ownerPassword === openPassword)) { setError("Les permissions nécessitent un mot de passe propriétaire distinct."); return; }
    setError(null);
    const result = await onExport({ quality, flattenForms, flattenAnnotations, openPassword, ownerPassword, allowPrinting, allowModification });
    setOpenPassword(""); setConfirmation(""); setOwnerPassword(""); setOwnerConfirmation("");
    if (!result) setError("Export non enregistré. Consultez le message du document et réessayez.");
  };
  return <div className="unsaved-dialog-backdrop" role="presentation"><section ref={dialogRef} className="unsaved-dialog advanced-export-dialog" role="dialog" aria-modal="true" aria-labelledby="advanced-export-title" onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Escape" && !busy) onCancel();
    if (event.key === "Tab") {
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(":is(input, select, button):not(:disabled)")];
      const index = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1]?.focus(); }
      else if (!event.shiftKey && index === items.length - 1) { event.preventDefault(); items[0]?.focus(); }
    }
  }}>
    <h2 id="advanced-export-title">{localize("Exporter / Finaliser")}</h2>
    <fieldset disabled={busy}>
      <label>{localize("Profil")}<select aria-label={localize("Profil de compression")} value={quality} onChange={(e) => setQuality(e.target.value as ExportOptions["quality"])}>{Object.entries(EXPORT_QUALITY_LABELS).map(([value, label]) => <option key={value} value={value}>{localize(label)}</option>)}</select></label>
      <p>{localize("Qualité maximale conserve les images. Équilibré et Taille réduite recompressent les images et réduisent leur résolution ; texte et formes restent vectoriels.")}</p>
      <label><input type="checkbox" checked={flattenForms} onChange={(e) => setFlattenForms(e.target.checked)} />{localize("Finaliser les champs de formulaire")}</label>
      <label><input type="checkbox" checked={flattenAnnotations} onChange={(e) => setFlattenAnnotations(e.target.checked)} />{localize("Finaliser les annotations")}</label>
      <p>{localize("Les objets ajoutés sont toujours intégrés au PDF. La finalisation rend les champs ou annotations permanents. Le contenu des commentaires et les pièces jointes des annotations finalisées sont supprimés.")}</p>
      <label>{localize("Mot de passe d’ouverture")}<input type="password" autoComplete="new-password" value={openPassword} onChange={(e) => setOpenPassword(e.target.value)} /></label>
      <label>{localize("Confirmer le mot de passe d’ouverture")}<input type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
      <label>{localize("Mot de passe propriétaire")}<input type="password" autoComplete="new-password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} /></label>
      <label>{localize("Confirmer le mot de passe propriétaire")}<input type="password" autoComplete="new-password" value={ownerConfirmation} onChange={(e) => setOwnerConfirmation(e.target.value)} /></label>
      <label><input type="checkbox" checked={allowPrinting} onChange={(e) => setAllowPrinting(e.target.checked)} />{localize("Autoriser l’impression")}</label>
      <label><input type="checkbox" checked={allowModification} onChange={(e) => setAllowModification(e.target.checked)} />{localize("Autoriser les modifications")}</label>
      <p>{localize("Certains lecteurs ignorent les permissions PDF. Une signature graphique n’est pas une signature numérique avec certificat.")}</p>
    </fieldset>
    {error ? <p role="alert">{localize(error)}</p> : null}
    <div className="unsaved-dialog__actions"><button type="button" disabled={busy} onClick={onCancel}>{localize("Annuler")}</button><button type="button" disabled={busy} onClick={() => void submit()}>{busy ? localize("Export en cours…") : localize("Exporter")}</button></div>
  </section></div>;
}

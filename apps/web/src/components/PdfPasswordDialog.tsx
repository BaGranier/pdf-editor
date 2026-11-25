import { useLocale } from "../viewer/locale";
import { useEffect, useRef, type FormEvent } from "react";

export function PdfPasswordDialog({ error, onAnswer }: {
  error: string;
  onAnswer: (password: string | null) => void;
}) {
  const { t: localize } = useLocale();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [error]);
  function answer(event: FormEvent) {
    event.preventDefault();
    const value = input.current?.value ?? "";
    if (input.current) input.current.value = "";
    onAnswer(value);
  }
  return <div className="ocr-dialog-backdrop" onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onAnswer(null); }
    if (event.key === "Tab") {
      const controls = event.currentTarget.querySelectorAll<HTMLElement>("input, button");
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <section className="ocr-dialog" role="dialog" aria-modal="true" aria-label={localize("PDF protégé")}>
      <h2>{localize("PDF protégé")}</h2>
      <p>{localize("Session temporaire. La copie déchiffrée reste en mémoire et disparaît de la reprise après fermeture ou rechargement.")}</p>
      <p>{localize("Pour produire une copie protégée, choisissez le chiffrement dans Fichier → Exporter / Finaliser. Les anciennes copies restaurées ne portent pas d’indicateur de chiffrement. Fermez individuellement les onglets concernés pour retirer leurs copies du stockage de reprise.")}</p>
      <form className="ocr-dialog__form" onSubmit={answer}>
        <label>{localize("Mot de passe")}<input ref={input} type="password" autoComplete="off" /></label>
        {error ? <p role="alert">{localize(error)}</p> : null}
        <div className="ocr-dialog__actions">
          <button type="button" onClick={() => onAnswer(null)}>{localize("Annuler")}</button>
          <button type="submit">{localize("Ouvrir")}</button>
        </div>
      </form>
    </section>
  </div>;
}

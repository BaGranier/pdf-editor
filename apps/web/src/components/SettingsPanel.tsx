import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, type Locale } from "../viewer/locale";

export function SettingsPanel({ children, onClose, onLocale, author, onAuthor, onReset, resetDisabled }: {
  children: ReactNode;
  onClose: () => void;
  onLocale: (value: Locale) => void;
  author: string;
  onAuthor: (value: string) => void;
  onReset: () => void;
  resetDisabled: boolean;
}) {
  const { locale, t } = useLocale();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  return createPortal(<section className="floating-surface settings-panel" role="dialog" aria-label={t("Paramètres")}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.stopPropagation(); onClose(); }
    }}>
    <header><h2>{t("Paramètres")}</h2>
      <button ref={close} type="button" aria-label={t("Fermer les paramètres")} onClick={onClose}>×</button></header>
    <fieldset>
      <legend>{t("Général")}</legend>
      <label>{t("Langue de l’interface")}
        <select value={locale} onChange={(event) => onLocale(event.currentTarget.value === "en" ? "en" : "fr")}>
          <option value="fr">Français</option><option value="en">English</option>
        </select>
      </label>
      <label>{t("Auteur par défaut des commentaires")}
        <input maxLength={200} value={author} onChange={(event) => onAuthor(event.currentTarget.value)} />
      </label>
      <button type="button" disabled={resetDisabled} onClick={onReset}>{t("Réinitialiser les données locales")}</button>
    </fieldset>
    <fieldset><legend>{t("Apparence")}</legend>{children}</fieldset>
  </section>, document.body);
}

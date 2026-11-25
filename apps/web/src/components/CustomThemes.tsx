import { useLayoutEffect, useState } from "react";
import { isThemeId, THEMES, type ThemeId } from "../viewer/themes";

const colors = {
  "--surface-secondary": "Couleur principale",
  "--accent": "Accentuation",
  "--app-bg": "Fond",
  "--surface": "Panneaux",
  "--text-primary": "Texte",
  "--border": "Bordures",
  "--accent-hover": "Éléments interactifs",
} as const;

type ColorKey = keyof typeof colors;
type Palette = Record<ColorKey, string>;
export type CustomTheme = { id: string; label: string; base: ThemeId; palette: Palette };

const storageKey = "pdf-studio-custom-themes";
const colorKeys = Object.keys(colors) as ColorKey[];

export function loadCustomThemes(): { themes: CustomTheme[]; activeId: string | null } {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    const themes = Array.isArray(stored.themes) ? stored.themes.filter((theme: CustomTheme) =>
      theme && typeof theme.id === "string" && typeof theme.label === "string" && isThemeId(theme.base) &&
      colorKeys.every((key) => /^#[\da-f]{6}$/i.test(theme.palette?.[key]))) : [];
    return { themes, activeId: themes.some((theme: CustomTheme) => theme.id === stored.activeId) ? stored.activeId : null };
  } catch {
    return { themes: [], activeId: null };
  }
}

export function saveCustomThemes(themes: CustomTheme[], activeId: string | null) {
  localStorage.setItem(storageKey, JSON.stringify({ themes, activeId }));
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export function useThemeAppearance(base: ThemeId, custom: CustomTheme | null) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = custom?.base ?? base;
    if (!custom) return;
    const palette = custom.palette;
    const onAccent = contrast(palette["--accent"], "#ffffff") >= 4.5 ? "#ffffff" : "#000000";
    const overrides = {
      ...palette,
      "--text-secondary": palette["--text-primary"],
      "--text-muted": palette["--text-primary"],
      "--border-strong": palette["--border"],
      "--surface-muted": palette["--surface-secondary"],
      "--surface-accent": palette["--surface"],
      "--focus-ring": palette["--accent"],
      "--on-accent": onAccent,
      "--selection": "color-mix(in srgb, var(--accent) 22%, transparent)",
      "--accent-soft": "color-mix(in srgb, var(--accent) 19%, transparent)",
      "--button-hover": "color-mix(in srgb, var(--accent-hover) 15%, transparent)",
      "color-scheme": luminance(palette["--surface"]) < 0.18 ? "dark" : "light",
    };
    for (const [key, value] of Object.entries(overrides)) root.style.setProperty(key, value);
    return () => { for (const key of Object.keys(overrides)) root.style.removeProperty(key); };
  }, [base, custom]);
}

function nativeDraft(base: ThemeId, label = ""): CustomTheme {
  // Read the native values synchronously, then restore the active preview before paint.
  const root = document.documentElement;
  const previous = root.dataset.theme;
  const previousStyle = root.getAttribute("style");
  for (const key of colorKeys) root.style.removeProperty(key);
  root.dataset.theme = base;
  const style = getComputedStyle(root);
  const palette = Object.fromEntries(colorKeys.map((key) => [key, style.getPropertyValue(key).trim()])) as Palette;
  root.dataset.theme = previous ?? base;
  if (previousStyle === null) root.removeAttribute("style");
  else root.setAttribute("style", previousStyle);
  return { id: crypto.randomUUID(), base, label, palette };
}

export function CustomThemeEditor({ active, base, onPreview, onSave, onDelete, onClose }: {
  active: CustomTheme | null;
  base: ThemeId;
  onPreview: (theme: CustomTheme | null) => void;
  onSave: (theme: CustomTheme) => void;
  onDelete: (theme: CustomTheme) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => active ?? nativeDraft(base));
  const update = (next: CustomTheme) => {
    setDraft(next);
    onPreview(next);
  };
  const palette = draft.palette;
  const lowContrast = (["--app-bg", "--surface", "--surface-secondary"] as const)
    .some((background) => contrast(palette["--text-primary"], palette[background]) < 4.5);
  return (
    <section className="floating-surface custom-theme-editor" aria-label="Personnaliser le thème" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    }}>
      <h2>Personnaliser le thème</h2>
      {active ? <button type="button" onClick={() => update(nativeDraft(draft.base))}>Nouveau thème</button> : null}
      <label>Nom<input value={draft.label} maxLength={60} onChange={(event) => update({ ...draft, label: event.target.value })} /></label>
      <label>Thème de base<select value={draft.base} onChange={(event) => {
        const value = event.target.value;
        if (isThemeId(value)) update({ ...nativeDraft(value, draft.label), id: draft.id });
      }}>{THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}</select></label>
      {colorKeys.map((key) => <label key={key}>{colors[key]}<input type="color" value={palette[key]} onChange={(event) =>
        update({ ...draft, palette: { ...palette, [key]: event.target.value } })} /></label>)}
      {lowContrast ? <p role="status">Contraste du texte inférieur à 4,5:1 sur au moins un fond.</p> : null}
      <div className="custom-theme-editor__actions">
        <button type="button" disabled={!draft.label.trim()} onClick={() => onSave({ ...draft, label: draft.label.trim() })}>Enregistrer le thème</button>
        {active ? <>
          <button type="button" onClick={() => update({ ...draft, id: crypto.randomUUID(), label: `${draft.label} (copie)`.slice(0, 60) })}>Dupliquer</button>
          {draft.id === active.id ? <button type="button" onClick={() => onDelete(active)}>Supprimer le thème</button> : null}
        </> : null}
        <button type="button" onClick={onClose}>Annuler</button>
      </div>
    </section>
  );
}

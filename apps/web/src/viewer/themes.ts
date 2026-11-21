export const THEMES = [
  { id: "light", label: "Clair" },
  { id: "dark", label: "Sombre" },
  { id: "ocean", label: "Océan" },
  { id: "forest", label: "Forêt" },
  { id: "plum", label: "Prune" },
  { id: "sand", label: "Sable" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function systemTheme(): ThemeId {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

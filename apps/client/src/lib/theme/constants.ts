export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME = "dark";

export const THEMES = [
  { name: "dark", label: "Dark" },
  { name: "light", label: "Light" },
] as const;

export type ThemeName = (typeof THEMES)[number]["name"];

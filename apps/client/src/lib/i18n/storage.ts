import { normalizeLocale } from "@/lib/i18n/catalog";
import type { AppLocale } from "@/lib/i18n/types";

const LOCALE_STORAGE_KEY = "my-codex-app.locale";

export function loadStoredLocale(): AppLocale | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return normalizeLocale(raw);
}

export function saveStoredLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export function detectPreferredLocale(): AppLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }

  return normalizeLocale(navigator.languages?.[0] ?? navigator.language);
}

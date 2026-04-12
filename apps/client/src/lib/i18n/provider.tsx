import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { createTranslator, normalizeLocale } from "@/lib/i18n/catalog";
import { formatDateTime, formatRelativeTime } from "@/lib/i18n/formatters";
import { detectPreferredLocale, loadStoredLocale, saveStoredLocale } from "@/lib/i18n/storage";
import type { AppLocale, I18nShape } from "@/lib/i18n/types";

export const I18nContext = createContext<I18nShape | null>(null);

function getInitialLocale(): AppLocale {
  return loadStoredLocale() ?? detectPreferredLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(getInitialLocale);

  useEffect(() => {
    saveStoredLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nShape>(() => {
    const t = createTranslator(locale);

    return {
      formatDateTime: (value) => formatDateTime(locale, value, t),
      formatRelativeTime: (value) => formatRelativeTime(locale, value, t),
      locale,
      setLocale: (nextLocale) => {
        setLocaleState(normalizeLocale(nextLocale));
      },
      t
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

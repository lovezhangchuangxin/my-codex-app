import { useContext } from "react";

import { I18nContext } from "@/lib/i18n/provider";

export function useI18n() {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error("useI18n must be used within LocaleProvider");
  }

  return value;
}

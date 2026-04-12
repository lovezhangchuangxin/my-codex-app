import { translateEnglish } from "@/lib/i18n/catalog";
import type { AppLocale } from "@/lib/i18n/types";

function safeDateTimeFormat(locale: AppLocale, date: Date) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }
}

function safeRelativeTimeFormat(locale: AppLocale, value: number, unit: Intl.RelativeTimeFormatUnit) {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
  }
}

export function formatDateTime(
  locale: AppLocale,
  value: number | undefined,
  t: (key: string) => string = translateEnglish
) {
  if (!value) {
    return t("common.notAvailable");
  }

  return safeDateTimeFormat(locale, new Date(value * 1000));
}

export function formatRelativeTime(
  locale: AppLocale,
  seconds: number,
  t: (key: string) => string = translateEnglish
) {
  const deltaSeconds = seconds - Math.floor(Date.now() / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  if (absoluteSeconds < 45) {
    return t("time.justNow");
  }

  if (absoluteSeconds < 3600) {
    return safeRelativeTimeFormat(locale, Math.round(deltaSeconds / 60), "minute");
  }

  if (absoluteSeconds < 86400) {
    return safeRelativeTimeFormat(locale, Math.round(deltaSeconds / 3600), "hour");
  }

  if (absoluteSeconds < 604800) {
    return safeRelativeTimeFormat(locale, Math.round(deltaSeconds / 86400), "day");
  }

  return safeDateTimeFormat(locale, new Date(seconds * 1000));
}

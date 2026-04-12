import { enMessages } from "@/lib/i18n/messages/en";
import { zhCnMessages } from "@/lib/i18n/messages/zh-CN";
import type { AppLocale, MessageCatalog, MessageEntry, MessageParams } from "@/lib/i18n/types";

export type MessageKey = keyof typeof enMessages;

const messageCatalogs: Record<AppLocale, typeof enMessages> = {
  en: enMessages,
  "zh-CN": zhCnMessages
};

function formatTemplate(template: string, params?: MessageParams) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params?.[key] ?? ""));
}

function resolveEntry(entry: MessageEntry, params?: MessageParams) {
  return typeof entry === "function" ? entry(params ?? {}) : formatTemplate(entry, params);
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (!value) {
    return "en";
  }

  return value.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function getMessages(locale: AppLocale): MessageCatalog {
  return messageCatalogs[locale];
}

export function createTranslator(locale: AppLocale) {
  const messages = messageCatalogs[locale] as MessageCatalog;

  return (key: MessageKey | string, params?: MessageParams) => {
    const localizedEntry = messages[key];
    if (localizedEntry) {
      return resolveEntry(localizedEntry, params);
    }

    const fallbackEntry = enMessages[key as MessageKey];
    if (fallbackEntry) {
      return resolveEntry(fallbackEntry, params);
    }

    return key;
  };
}

export const translateEnglish = createTranslator("en");

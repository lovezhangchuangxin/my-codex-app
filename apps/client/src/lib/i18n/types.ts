export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export type MessageParams = Record<string, number | string | undefined>;

export type MessageEntry = string | ((params: MessageParams) => string);

export type MessageCatalog = Record<string, MessageEntry>;

export interface I18nShape {
  formatDateTime: (value: number | undefined) => string;
  formatRelativeTime: (value: number) => string;
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, params?: MessageParams) => string;
}

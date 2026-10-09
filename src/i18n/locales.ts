import { workspaceMessages } from "./messages-workspace";
import { settingsMessages } from "./messages-settings";
import { japaneseMessages } from "./messages-ja";
import { simplifiedChineseMessages } from "./messages-zh-CN";
import { traditionalChineseMessages } from "./messages-zh-TW";

export const interfaceLanguages = [
  { locale: "en", label: "English", intlLocale: "en" },
  { locale: "hi", label: "हिन्दी", intlLocale: "hi-IN" },
  { locale: "es", label: "Español", intlLocale: "es" },
  { locale: "ja", label: "日本語", intlLocale: "ja" },
  { locale: "zh-CN", label: "简体中文", intlLocale: "zh-CN" },
  { locale: "zh-TW", label: "繁體中文", intlLocale: "zh-TW" },
] as const;

export type Locale = (typeof interfaceLanguages)[number]["locale"];
export const isLocale = (value: unknown): value is Locale =>
  interfaceLanguages.some(({ locale }) => locale === value);

export const sourceMessages = { ...workspaceMessages, ...settingsMessages };
export const translationCatalogs: Record<
  Exclude<Locale, "en">,
  Record<string, string>
> = {
  hi: Object.fromEntries(
    Object.entries(sourceMessages).map(([source, messages]) => [
      source,
      messages.hi,
    ]),
  ),
  es: Object.fromEntries(
    Object.entries(sourceMessages).map(([source, messages]) => [
      source,
      messages.es,
    ]),
  ),
  ja: japaneseMessages,
  "zh-CN": simplifiedChineseMessages,
  "zh-TW": traditionalChineseMessages,
};

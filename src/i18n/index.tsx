import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  interfaceLanguages,
  isLocale,
  translationCatalogs,
  type Locale,
} from "./locales";

export type { Locale } from "./locales";
export type TranslationValues = Record<string, string | number>;
export type Translate = (message: string, values?: TranslationValues) => string;
const storageKey = "open-granola-language";

function languageTools(locale: Locale) {
  const intlLocale = interfaceLanguages.find(
    (language) => language.locale === locale,
  )!.intlLocale;
  const messages = locale === "en" ? undefined : translationCatalogs[locale];
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(intlLocale, options).format(value);
  const formatDate = (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => {
    const date =
      value instanceof Date
        ? value
        : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(`${value}T00:00:00`)
          : new Date(value);
    // Preserve unparseable source labels (for example a human-entered due date).
    return Number.isNaN(+date)
      ? String(value)
      : new Intl.DateTimeFormat(intlLocale, options).format(date);
  };
  const t: Translate = (message, values = {}) => {
    const translated =
      messages && Object.hasOwn(messages, message)
        ? messages[message]
        : message;
    return translated.replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      (placeholder, key: string) => {
        const value = values[key];
        return value === undefined
          ? placeholder
          : typeof value === "number"
            ? formatNumber(value)
            : value;
      },
    );
  };
  const plural = (
    one: string,
    other: string,
    count: number,
    values: TranslationValues = {},
  ) =>
    t(new Intl.PluralRules(intlLocale).select(count) === "one" ? one : other, {
      ...values,
      count,
    });
  return { locale, t, formatDate, formatNumber, plural };
}

const LanguageContext = createContext({
  ...languageTools("en"),
  setLocale: (locale: Locale) => {
    void locale;
  },
});

function storedLocale(): Locale {
  try {
    const value = window.localStorage.getItem(storageKey);
    return isLocale(value) ? value : "en";
  } catch {
    return "en";
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(storedLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(storageKey, locale);
    } catch {
      /* The current session still has a usable language preference. */
    }
  }, [locale]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && isLocale(event.newValue))
        updateLocale(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const value = useMemo(
    () => ({
      ...languageTools(locale),
      setLocale: (next: Locale) => {
        if (isLocale(next)) updateLocale(next);
      },
    }),
    [locale],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- This hook reads the context owned by LanguageProvider.
export function useI18n() {
  return useContext(LanguageContext);
}

import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, useI18n } from "./index";
import { workspaceMessages } from "./messages-workspace";
import { settingsMessages } from "./messages-settings";
import {
  interfaceLanguages,
  sourceMessages,
  translationCatalogs,
} from "./locales";

function LanguageExample() {
  const { locale, setLocale, t, plural, formatDate, formatNumber } = useI18n();
  return (
    <>
      <button onClick={() => setLocale("hi")}>Hindi</button>
      <button onClick={() => setLocale("es")}>Spanish</button>
      <button onClick={() => setLocale("ja")}>日本語</button>
      <button onClick={() => setLocale("zh-CN")}>简体中文</button>
      <button onClick={() => setLocale("zh-TW")}>繁體中文</button>
      <output data-testid="locale">{locale}</output>
      <output data-testid="label">{t("Meeting library")}</output>
      <output data-testid="count">
        {plural("{count} meeting", "{count} meetings", 2)}
      </output>
      <output data-testid="number">{formatNumber(12500)}</output>
      <output data-testid="date">
        {formatDate("2026-12-02", { month: "long", day: "numeric" })}
      </output>
    </>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

describe("workspace language", () => {
  it("provides English safely outside the provider and preserves unknown content", () => {
    const { result } = renderHook(useI18n);
    expect(result.current.locale).toBe("en");
    expect(result.current.t("Meeting library")).toBe("Meeting library");
    expect(result.current.t("Hello {name}", { name: "María {count}" })).toBe(
      "Hello María {count}",
    );
    expect(result.current.t("Unknown user content <script>")).toBe(
      "Unknown user content <script>",
    );
    expect(result.current.t("Missing {value}")).toBe("Missing {value}");
  });

  it("changes the interface, persists the language and formats Spanish counts and dates", () => {
    render(
      <LanguageProvider>
        <LanguageExample />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Spanish" }));
    expect(screen.getByTestId("label")).toHaveTextContent(
      "Biblioteca de reuniones",
    );
    expect(screen.getByTestId("count")).toHaveTextContent("2 reuniones");
    expect(screen.getByTestId("number")).toHaveTextContent(
      new Intl.NumberFormat("es").format(12500),
    );
    expect(screen.getByTestId("date")).toHaveTextContent(
      new Intl.DateTimeFormat("es", { month: "long", day: "numeric" }).format(
        new Date(2026, 11, 2),
      ),
    );
    expect(document.documentElement.lang).toBe("es");
    expect(window.localStorage.getItem("open-granola-language")).toBe("es");
  });

  it("restores Hindi and responds to another window's language preference", () => {
    window.localStorage.setItem("open-granola-language", "hi");
    render(
      <LanguageProvider>
        <LanguageExample />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("label")).toHaveTextContent("मीटिंग लाइब्रेरी");
    expect(document.documentElement.lang).toBe("hi");
    act(() =>
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "open-granola-language",
          newValue: "es",
        }),
      ),
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("es");
  });

  it("falls back for unsupported preferences and works when storage is unavailable", () => {
    window.localStorage.setItem("open-granola-language", "unsupported");
    const first = render(
      <LanguageProvider>
        <LanguageExample />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(
      <LanguageProvider>
        <LanguageExample />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hindi" }));
    expect(screen.getByTestId("label")).toHaveTextContent("मीटिंग लाइब्रेरी");
    expect(document.documentElement.lang).toBe("hi");
  });

  it.each(
    interfaceLanguages.filter(({ locale }) =>
      ["ja", "zh-CN", "zh-TW"].includes(locale),
    ),
  )(
    "switches, restores and synchronizes $locale with locale-aware formatting",
    ({ locale, label, intlLocale }) => {
      const view = render(
        <LanguageProvider>
          <LanguageExample />
        </LanguageProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByTestId("label")).not.toHaveTextContent(
        "Meeting library",
      );
      expect(document.documentElement.lang).toBe(locale);
      expect(window.localStorage.getItem("open-granola-language")).toBe(locale);
      expect(screen.getByTestId("number")).toHaveTextContent(
        new Intl.NumberFormat(intlLocale).format(12500),
      );
      expect(screen.getByTestId("date")).toHaveTextContent(
        new Intl.DateTimeFormat(intlLocale, {
          month: "long",
          day: "numeric",
        }).format(new Date(2026, 11, 2)),
      );
      view.unmount();
      render(
        <LanguageProvider>
          <LanguageExample />
        </LanguageProvider>,
      );
      expect(screen.getByTestId("locale")).toHaveTextContent(locale);
      fireEvent.click(screen.getByRole("button", { name: "Spanish" }));
      act(() =>
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "open-granola-language",
            newValue: locale,
          }),
        ),
      );
      expect(screen.getByTestId("locale")).toHaveTextContent(locale);
    },
  );

  it.each(["ja", "zh-CN", "zh-TW"] as const)(
    "preserves unrecognized content and interpolated values in %s",
    (locale) => {
      window.localStorage.setItem("open-granola-language", locale);
      const { result } = renderHook(useI18n, { wrapper: LanguageProvider });
      expect(result.current.t("__proto__")).toBe("__proto__");
      expect(result.current.t("constructor")).toBe("constructor");
      expect(
        result.current.t("Source: 未翻訳のメモ / 原始记录 / 原始紀錄"),
      ).toBe("Source: 未翻訳のメモ / 原始记录 / 原始紀錄");
      expect(result.current.t("Hello {name}", { name: "田中 {count}" })).toBe(
        "Hello 田中 {count}",
      );
    },
  );

  it("keeps every catalog entry complete and interpolation placeholders intact", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)]
        .map((match) => match[1])
        .sort();
    for (const catalog of [workspaceMessages, settingsMessages]) {
      for (const [source, translated] of Object.entries(catalog)) {
        for (const locale of ["hi", "es"] as const) {
          expect(translated[locale].trim(), `${source} (${locale})`).not.toBe(
            "",
          );
          expect(
            placeholders(translated[locale]),
            `${source} (${locale})`,
          ).toEqual(placeholders(source));
        }
      }
    }
    for (const [locale, catalog] of Object.entries(translationCatalogs)) {
      expect(Object.keys(catalog).sort(), locale).toEqual(
        Object.keys(sourceMessages).sort(),
      );
      for (const [source, translated] of Object.entries(catalog)) {
        expect(translated.trim(), `${source} (${locale})`).not.toBe("");
        expect(placeholders(translated), `${source} (${locale})`).toEqual(
          placeholders(source),
        );
        if (source.includes("DELETE"))
          expect(translated, locale).toContain("DELETE");
      }
    }
  });
});

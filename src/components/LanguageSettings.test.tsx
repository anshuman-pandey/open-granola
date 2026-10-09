import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { LanguageSettings } from "./LanguageSettings";
import { translationCatalogs } from "../i18n/locales";

const backend = vi.hoisted(() => ({
  mode: "tauri",
  getLanguageSettings: vi.fn(),
  saveLanguageSettings: vi.fn(),
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  backend.mode = "tauri";
  backend.getLanguageSettings.mockResolvedValue({
    transcription_language: "hi",
    summary_language: "es",
  });
  backend.saveLanguageSettings.mockImplementation(async (value) => value);
});

describe("independent language preferences", () => {
  it.each(["ja", "zh-CN", "zh-TW"] as const)(
    "keeps %s interface choice separate from Japanese/Chinese meeting codes",
    async (locale) => {
      backend.getLanguageSettings.mockResolvedValue({
        transcription_language: "ja",
        summary_language: "zh",
      });
      render(
        <LanguageProvider>
          <LanguageSettings />
        </LanguageProvider>,
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Spoken language")).toBeEnabled(),
      );
      const interfaceSelect = screen.getByLabelText("Interface language");
      for (const name of ["日本語", "简体中文", "繁體中文"]) {
        expect(screen.getByRole("option", { name })).toBeInTheDocument();
      }
      fireEvent.change(interfaceSelect, { target: { value: locale } });
      const t = (message: string) => translationCatalogs[locale][message];
      expect(screen.getByLabelText(t("Interface language"))).toHaveValue(
        locale,
      );
      expect(screen.getByLabelText(t("Spoken language"))).toHaveValue("ja");
      const summary = screen.getByLabelText(t("Summary language"));
      expect(summary).toHaveValue("zh");
      expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
      fireEvent.change(summary, { target: { value: "ja" } });
      fireEvent.click(
        screen.getByRole("button", { name: t("Save meeting languages") }),
      );
      await screen.findByText(t("Language settings saved."));
      expect(backend.saveLanguageSettings).toHaveBeenCalledExactlyOnceWith({
        transcription_language: "ja",
        summary_language: "ja",
      });
      expect(window.localStorage.getItem("open-granola-language")).toBe(locale);
    },
  );
  it("repairs unreadable preferences only through an explicit reset", async () => {
    backend.getLanguageSettings.mockRejectedValueOnce(
      new Error("Saved language settings are invalid"),
    );
    render(
      <LanguageProvider>
        <LanguageSettings />
      </LanguageProvider>,
    );
    await screen.findByRole("alert");
    expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Reset meeting languages to automatic",
      }),
    );
    await screen.findByText("Language settings saved.");
    expect(backend.saveLanguageSettings).toHaveBeenCalledExactlyOnceWith({
      transcription_language: "auto",
      summary_language: "auto",
    });
    expect(screen.getByLabelText("Spoken language")).toBeEnabled();
    expect(screen.getByLabelText("Spoken language")).toHaveValue("auto");
  });
  it("loads native codes and saves only an explicit change", async () => {
    render(
      <LanguageProvider>
        <LanguageSettings />
      </LanguageProvider>,
    );
    const speech = screen.getByLabelText("Spoken language");
    await waitFor(() => expect(speech).toBeEnabled());
    expect(speech).toHaveValue("hi");
    expect(screen.getByLabelText("Summary language")).toHaveValue("es");
    expect(
      screen.getByRole("button", { name: "Save meeting languages" }),
    ).toBeDisabled();
    fireEvent.change(speech, { target: { value: "ja" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save meeting languages" }),
    );
    expect(
      await screen.findByText("Language settings saved."),
    ).toBeInTheDocument();
    expect(backend.saveLanguageSettings).toHaveBeenCalledExactlyOnceWith({
      transcription_language: "ja",
      summary_language: "es",
    });
  });

  it("does not overwrite unknown native preferences after a failed load and can retry", async () => {
    backend.getLanguageSettings.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    render(
      <LanguageProvider>
        <LanguageSettings />
      </LanguageProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Database unavailable",
    );
    expect(screen.getByLabelText("Spoken language")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save meeting languages" }),
    ).toBeDisabled();
    expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Spoken language")).toHaveValue("hi"),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserves a failed draft for retry without claiming success", async () => {
    backend.saveLanguageSettings.mockRejectedValueOnce(
      new Error("Capture active"),
    );
    render(
      <LanguageProvider>
        <LanguageSettings />
      </LanguageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Summary language")).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("Summary language"), {
      target: { value: "fr" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save meeting languages" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Capture active",
    );
    expect(screen.getByLabelText("Summary language")).toHaveValue("fr");
    expect(
      screen.queryByText("Language settings saved."),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save meeting languages" }),
    );
    expect(
      await screen.findByText("Language settings saved."),
    ).toBeInTheDocument();
  });

  it("locks meeting preferences during capture while allowing interface translation", async () => {
    render(
      <LanguageProvider>
        <LanguageSettings captureLocked />
      </LanguageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Spoken language")).toHaveValue("hi"),
    );
    expect(screen.getByLabelText("Spoken language")).toBeDisabled();
    expect(screen.getByLabelText("Summary language")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Interface language"), {
      target: { value: "es" },
    });
    expect(document.documentElement.lang).toBe("es");
    expect(window.localStorage.getItem("open-granola-language")).toBe("es");
    expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
  });

  it("translates the browser demo without pretending to save desktop preferences", () => {
    backend.mode = "demo";
    render(
      <LanguageProvider>
        <LanguageSettings />
      </LanguageProvider>,
    );
    expect(screen.getByLabelText("Spoken language")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save meeting languages" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Interface language"), {
      target: { value: "hi" },
    });
    expect(document.documentElement.lang).toBe("hi");
    expect(backend.getLanguageSettings).not.toHaveBeenCalled();
    expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
  });
});

import catalog from "./language-options.json";

export interface LanguageSettings {
  transcription_language: string;
  summary_language: string;
}

export const DEFAULT_LANGUAGE_SETTINGS: Readonly<LanguageSettings> =
  Object.freeze({
    transcription_language: "auto",
    summary_language: "auto",
  });

// The native validator reads the same catalog at compile time. Automatic
// detection/source-language labels are supplied separately by each control.
export const LANGUAGE_OPTIONS: readonly { code: string; label: string }[] =
  catalog.map(({ code, name, native_name }) => ({
    code,
    label: name === native_name ? name : `${name} · ${native_name}`,
  }));

export function languageLabel(code: string): string {
  if (code === "auto") return "Automatic";
  return (
    LANGUAGE_OPTIONS.find((language) => language.code === code)?.label ??
    "Unknown language"
  );
}

import { Languages, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n, type Locale } from "../i18n";
import { getBackend } from "../lib/backend";
import {
  DEFAULT_LANGUAGE_SETTINGS,
  LANGUAGE_OPTIONS,
  type LanguageSettings as Preferences,
} from "../lib/language-settings";

export function LanguageSettings({
  captureLocked = false,
  disabled = false,
}: {
  captureLocked?: boolean;
  disabled?: boolean;
}) {
  const { locale, setLocale, t } = useI18n();
  const backend = getBackend();
  const demo = backend.mode === "demo";
  const [saved, setSaved] = useState<Preferences | null>(
    demo ? { ...DEFAULT_LANGUAGE_SETTINGS } : null,
  );
  const [draft, setDraft] = useState<Preferences>({
    ...DEFAULT_LANGUAGE_SETTINGS,
  });
  const [loading, setLoading] = useState(!demo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) return;
    let active = true;
    backend
      .getLanguageSettings()
      .then((value) => {
        if (!active) return;
        setSaved(value);
        setDraft(value);
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [backend, demo, retry]);
  const update = (key: keyof Preferences, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(false);
    setError(null);
  };
  const save = async (preferences: Preferences) => {
    if (demo || captureLocked || disabled || saving || loading) return;
    setSaving(true);
    setError(null);
    setNotice(false);
    try {
      const result = await backend.saveLanguageSettings(preferences);
      setSaved(result);
      setDraft(result);
      setNotice(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  const dirty =
    saved &&
    (draft.transcription_language !== saved.transcription_language ||
      draft.summary_language !== saved.summary_language);
  const displayNames = new Intl.DisplayNames([locale], { type: "language" });
  const options = LANGUAGE_OPTIONS.map(({ code, label }) => (
    <option key={code} value={code}>
      {displayNames.of(code) ?? label}
    </option>
  ));
  const selectClass =
    "mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm";
  return (
    <section
      className="surface-card overflow-hidden"
      aria-labelledby="language-heading"
    >
      <header className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <Languages size={18} />
        </span>
        <div>
          <h2 id="language-heading" className="text-sm font-semibold">
            {t("Languages")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(
              "Choose the interface, spoken language, and language of your notes separately.",
            )}
          </p>
        </div>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <label
          className="block text-xs font-semibold"
          htmlFor="interface-language"
        >
          {t("Interface language")}
          <select
            id="interface-language"
            className={selectClass}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            aria-describedby="interface-language-help"
          >
            <option value="en" lang="en">
              English
            </option>
            <option value="hi" lang="hi">
              हिन्दी
            </option>
            <option value="es" lang="es">
              Español
            </option>
          </select>
        </label>
        <p
          id="interface-language-help"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {t(
            "Changes immediately on this device. Existing meeting content stays in its original language.",
          )}
        </p>
        <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <label
            className="block text-xs font-semibold"
            htmlFor="transcription-language"
          >
            {t("Spoken language")}
            <select
              id="transcription-language"
              className={selectClass}
              value={draft.transcription_language}
              disabled={
                demo || loading || saving || captureLocked || disabled || !saved
              }
              onChange={(event) =>
                update("transcription_language", event.target.value)
              }
              aria-describedby="transcription-language-help"
            >
              <option value="auto">{t("Detect automatically")}</option>
              {options}
            </select>
          </label>
          <label
            className="block text-xs font-semibold"
            htmlFor="summary-language"
          >
            {t("Summary language")}
            <select
              id="summary-language"
              className={selectClass}
              value={draft.summary_language}
              disabled={
                demo || loading || saving || captureLocked || disabled || !saved
              }
              onChange={(event) =>
                update("summary_language", event.target.value)
              }
              aria-describedby="summary-language-help"
            >
              <option value="auto">{t("Same as the conversation")}</option>
              {options}
            </select>
          </label>
        </div>
        <p
          id="transcription-language-help"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {t(
            "Affects new recordings. Choose the main spoken language if automatic detection gets it wrong. Transcription keeps the spoken words; it does not translate audio into English. A multilingual Whisper model is required for other languages.",
          )}
        </p>
        <p
          id="summary-language-help"
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {t(
            "Applies to new summaries and summary retries. Existing transcripts and completed action items are preserved. Output quality depends on your selected model; a language choice is a request, not a guarantee.",
          )}
        </p>
        {demo && (
          <p className="rounded-xl bg-secondary p-3 text-xs leading-relaxed">
            {t(
              "Recording and summary language settings are saved in the desktop app. Interface translation works in this demo.",
            )}
          </p>
        )}
        {captureLocked && (
          <p role="status" className="text-xs text-muted-foreground">
            {t(
              "Finish or discard the current recording before changing meeting languages.",
            )}
          </p>
        )}
        {error !== null && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs leading-relaxed"
          >
            <p>{t("Could not update language settings.")}</p>
            <p className="mt-1 break-words">{error}</p>
            {!saved && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  className="button-secondary"
                  disabled={loading || saving || disabled}
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setRetry((value) => value + 1);
                  }}
                >
                  {t("Try again")}
                </button>
                <button
                  className="button-secondary"
                  disabled={loading || saving || disabled || captureLocked}
                  onClick={() => void save({ ...DEFAULT_LANGUAGE_SETTINGS })}
                >
                  {t("Reset meeting languages to automatic")}
                </button>
                <p>
                  {t(
                    "Resets only these language preferences. Your saved notes stay unchanged.",
                  )}
                </p>
              </div>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="text-xs text-primary">
            {t("Language settings saved.")}
          </p>
        )}
        <button
          className="button-primary"
          disabled={
            demo || loading || saving || captureLocked || disabled || !dirty
          }
          onClick={() => void save(draft)}
        >
          {(loading || saving) && (
            <Loader2 size={14} className="animate-spin" />
          )}
          {loading
            ? t("Loading settings…")
            : saving
              ? t("Saving…")
              : t("Save meeting languages")}
        </button>
      </div>
    </section>
  );
}

import { languageLabel } from "../lib/language-settings";
import { useI18n } from "../i18n";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getBackend } from "../lib/backend";
import type { Backend } from "../lib/backend";
import type { Meeting } from "../lib/types";
import type { ProviderStatus } from "../lib/provider-types";

const names: Record<string, string> = {
  local: "Built-in local model",
  lm_studio: "LM Studio",
  openai: "OpenAI API",
  anthropic: "Claude API",
  openai_compatible: "Custom endpoint",
  chatgpt: "ChatGPT",
};
interface Props {
  meeting: Meeting;
  onAttempt?: () => Promise<void>;
  backend?: Pick<Backend, "mode" | "getProviderSettings" | "summarizeMeeting">;
}
export function ProcessingHistory({
  meeting,
  onAttempt,
  backend = getBackend(),
}: Props) {
  const { locale, t, formatDate, plural } = useI18n();
  const [destination, setDestination] = useState<ProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; local: boolean } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const mounted = useRef(true);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const reviewPanel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (destination) reviewPanel.current?.focus();
  }, [destination]);
  const summaryLanguage = (code: string) => {
    if (code === "auto") return t("Source language");
    try {
      return (
        new Intl.DisplayNames([locale], { type: "language" }).of(code) ??
        languageLabel(code)
      );
    } catch {
      return languageLabel(code);
    }
  };
  const history = meeting.processingHistory ?? [];
  const last = history[0];
  const latestSuccess = history.find((run) => run.status === "completed");
  const hasTranscript = meeting.transcript.some((segment) =>
    segment.text.trim(),
  );
  const review = async () => {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const settings = await backend.getProviderSettings();
      if (mounted.current) setDestination(settings);
    } catch (cause) {
      if (mounted.current) setError({ text: String(cause), local: false });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const run = async () => {
    if (!destination || busy || !hasTranscript) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await backend.summarizeMeeting(meeting.id, destination.config);
      if (mounted.current) {
        setNotice(
          "Summary updated. Transcript and existing action items are preserved.",
        );
        setDestination(null);
      }
    } catch (cause) {
      if (mounted.current) setError({ text: String(cause), local: false });
    } finally {
      try {
        await onAttempt?.();
      } catch {
        if (mounted.current)
          setError({
            text: "Could not refresh this note. Reopen it to see the saved result.",
            local: true,
          });
      }
      if (mounted.current) setBusy(false);
    }
  };
  if (backend.mode === "demo") return null;
  return (
    <section
      aria-label={t("Summary processing")}
      className="scrollbar-thin max-h-[45dvh] shrink-0 overflow-y-auto border-b border-border/70 bg-secondary/20 px-5 py-3 text-xs [overflow-wrap:anywhere] sm:px-8 lg:px-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-medium">
            {last?.status === "failed"
              ? t("Last summary attempt failed · saved note preserved")
              : last?.status === "running"
                ? t("Summary in progress")
                : t("Summary processing")}
          </p>
          <p className="text-muted-foreground">
            {latestSuccess
              ? `${t(names[latestSuccess.provider] ?? latestSuccess.provider)} · ${latestSuccess.model}`
              : t("No completed summary run recorded for this note.")}
          </p>
          {latestSuccess?.summary_language && (
            <p className="text-muted-foreground">
              {t("Requested summary language: {language}", {
                language: summaryLanguage(latestSuccess.summary_language),
              })}
            </p>
          )}
        </div>
        <button
          ref={reviewTrigger}
          disabled={busy || !hasTranscript || last?.status === "running"}
          onClick={() => void review()}
          className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 font-medium disabled:opacity-50"
        >
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          {busy ? t("Working…") : t("Regenerate summary")}
        </button>
      </div>
      {!hasTranscript && (
        <p className="mt-2 text-muted-foreground">
          {t("A saved transcript is required to generate a summary.")}
        </p>
      )}
      {last?.error && <p className="mt-2 text-destructive">{last.error}</p>}
      {history.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-muted-foreground">
            {history.length === 20
              ? t("Processing history · {count} most recent attempts", {
                  count: history.length,
                })
              : plural(
                  "Processing history · {count} attempt",
                  "Processing history · {count} attempts",
                  history.length,
                )}
          </summary>
          <p className="mt-2 text-muted-foreground">
            {t(
              "Each entry records the selected destination. A failed request may still have sent text. A local server can forward requests according to its own settings.",
            )}
          </p>
          <ol className="mt-2 max-h-44 space-y-2 overflow-y-auto">
            {history.map((item, index) => (
              <li
                key={`${item.started_at}-${index}`}
                className="rounded-lg border border-border/60 bg-card p-2"
              >
                <p>
                  {t(item.status)} · {t(names[item.provider] ?? item.provider)}{" "}
                  · {item.model}
                </p>
                <p className="mt-1 break-all text-muted-foreground">
                  {item.off_device
                    ? t("Remote text processing")
                    : t("Local processing route")}{" "}
                  · {item.endpoint || t("Built-in model")}
                </p>
                {item.summary_language && (
                  <p className="mt-1 text-muted-foreground">
                    {t("Requested summary language: {language}", {
                      language: summaryLanguage(item.summary_language),
                    })}
                  </p>
                )}
                <time
                  className="text-muted-foreground"
                  dateTime={item.started_at}
                >
                  {formatDate(item.started_at, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
                {item.error && (
                  <p className="mt-1 text-destructive">{item.error}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      {destination && (
        <div
          ref={reviewPanel}
          tabIndex={-1}
          className="mt-3 rounded-xl border border-border bg-card p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          role="group"
          aria-label={t("Review summary destination")}
        >
          <p className="font-medium">
            {t("Use {provider} · {model}", {
              provider: t(
                names[destination.config.provider] ??
                  destination.config.provider,
              ),
              model: destination.config.model,
            })}
          </p>
          <p className="mt-1 break-all text-muted-foreground">
            {destination.config.base_url || t("Built-in model on this device")}
          </p>
          <p className="mt-2 leading-relaxed">
            {destination.sends_transcript_off_device
              ? t(
                  "This sends this meeting’s transcript and template to the selected provider.",
                )
              : destination.uses_network
                ? t(
                    "This sends this meeting’s transcript and template to your local model server. Check that server’s own privacy settings.",
                  )
                : t("This processes the saved transcript on this device.")}{" "}
            {t(
              "Updates the title, summary, chapters and decisions. Your transcript and existing action items stay intact.",
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy}
              onClick={() => void run()}
              className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy
                ? t("Generating…")
                : destination.sends_transcript_off_device
                  ? t("Send text and regenerate")
                  : t("Generate summary")}
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setDestination(null);
                reviewTrigger.current?.focus();
              }}
              className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-destructive" role="alert">
          {error.local ? t(error.text) : error.text}
        </p>
      )}
      {notice && (
        <p className="mt-2 text-muted-foreground" role="status">
          {t(notice)}
        </p>
      )}
    </section>
  );
}

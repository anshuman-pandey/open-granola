import { useI18n } from "../i18n";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  FileUp,
  Folder,
  HardDrive,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getBackend } from "../lib/backend";
import { ProviderSettings } from "./ProviderSettings";
import { LanguageSettings } from "./LanguageSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

function Section({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-5 p-5 sm:p-6">{children}</div>
    </section>
  );
}

export function SettingsView({
  onLibraryChange,
  captureLocked = false,
}: {
  onLibraryChange?: () => void;
  captureLocked?: boolean;
}) {
  const { t, plural } = useI18n();
  const backend = getBackend();
  const demo = backend.mode === "demo";
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<
    "purge" | "retention" | null
  >(null);
  const [confirmText, setConfirmText] = useState("");
  const [retention, setRetention] = useState("90");
  const [languageSettingsVersion, setLanguageSettingsVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const confirmationTrigger = useRef<HTMLButtonElement>(null);
  const capabilities =
    status?.capabilities && typeof status.capabilities === "object"
      ? (status.capabilities as Record<string, unknown>)
      : {};
  const airlock =
    status?.airlock && typeof status.airlock === "object"
      ? (status.airlock as Record<string, unknown>)
      : {};

  useEffect(() => {
    if (demo) return;
    let active = true;
    backend
      .modelStatus()
      .then((value) => {
        if (active) {
          setStatus(value);
          if (typeof value.retention_days === "number") {
            setRetention(String(value.retention_days));
          }
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Couldn’t read desktop readiness. Retry to check your setup.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [backend, demo]);
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const value = await backend.modelStatus();
      setStatus(value);
      if (typeof value.retention_days === "number") {
        setRetention(String(value.retention_days));
      }
    } catch {
      setError(t("Couldn’t read desktop readiness. Please try again."));
    } finally {
      setLoading(false);
    }
  };
  const importFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setError(t("Choose a JSON export smaller than 20 MB."));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const content = await file.text();
      JSON.parse(content);
      const count = await backend.importGranola(content);
      setNotice(
        plural(
          "Imported {count} meeting. Your library has been refreshed.",
          "Imported {count} meetings. Your library has been refreshed.",
          count,
        ),
      );
      onLibraryChange?.();
    } catch {
      setError(
        t(
          "Import failed. Check that this is a supported Granola JSON export, then try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (confirmation === "purge") {
        await backend.purgeAll();
        setNotice(t("Your meeting library has been deleted."));
      } else {
        await backend.setRetention(Number(retention));
        setNotice(
          Number(retention)
            ? t(
                "Retention set to {days} days. Older notes may be removed by the desktop app.",
                { days: Number(retention) },
              )
            : t("Automatic retention deletion disabled."),
        );
      }
      setConfirmation(null);
      setConfirmText("");
      onLibraryChange?.();
      await refresh();
    } catch {
      setError(
        t(
          "This change could not be completed. Your library may be in use; stop any active session and try again.",
        ),
      );
    } finally {
      // Purge may delete the rows before later cleanup reports a failure.
      if (confirmation === "purge")
        setLanguageSettingsVersion((version) => version + 1);
      setBusy(false);
    }
  };

  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="workspace-page mx-auto max-w-4xl space-y-6 px-5 pb-24 pt-10 sm:px-8">
        <div>
          <p className="section-eyebrow">{t("Make yourself at home")}</p>
          <h1 className="font-display mt-3 text-[40px] leading-tight tracking-tight sm:text-[48px]">
            {t("Settings")}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {t(
              "Know what’s running, where your notes live, and what’s available.",
            )}
          </p>
        </div>
        {demo && (
          <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong className="font-semibold">
                {t("You’re exploring the browser demo.")}
              </strong>{" "}
              {t(
                "Meetings are sample data. Audio capture, local AI models, import, and library deletion require the desktop app.",
              )}
            </p>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl border border-border bg-secondary p-4 text-xs leading-relaxed"
          >
            <CheckCircle2 size={16} className="shrink-0 text-primary" />
            {t(notice)}
          </p>
        )}
        {error && !confirmation && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-relaxed text-destructive dark:text-red-400"
          >
            {t(error)}
          </p>
        )}
        <LanguageSettings
          key={languageSettingsVersion}
          captureLocked={captureLocked}
          disabled={busy}
        />
        <ProviderSettings onSaved={() => void refresh()} />
        <Section
          title={t("Privacy & storage")}
          description={t("Your workspace, on your device.")}
          icon={<Shield size={16} className="text-primary" />}
        >
          <div>
            <h3 className="text-[13px] font-semibold">
              {t("Local by design")}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t(
                "The desktop app stores notes and transcripts in its local database. Local storage is not a claim of encryption; your device and backups still control who can access those files.",
              )}
            </p>
          </div>
          <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold">{t("Network mode")}</h3>
              {!demo && typeof airlock.os_enforced === "boolean" && (
                <p className="mt-2 inline-flex rounded-md bg-secondary px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {airlock.os_enforced
                    ? t("OS network block active")
                    : airlock.mode === "development"
                      ? t("Development mode")
                      : t("Application policy")}
                </p>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {demo
                  ? t(
                      "This page is a browser preview. No network telemetry is measured here.",
                    )
                  : typeof airlock.detail === "string"
                    ? airlock.detail
                    : t(
                        "Waiting for desktop status. Network usage is not measured in this interface.",
                      )}
              </p>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">
                {t("Recording responsibly")}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t(
                  "Let everyone in the conversation know before recording. Verify important details in transcripts and AI summaries.",
                )}
              </p>
            </div>
          </div>
        </Section>
        <Section
          title={t("Desktop readiness")}
          description={t("Check the models and features available to you.")}
          icon={<Cpu size={16} className="text-primary" />}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {demo
                ? t("Model checks are available in the desktop app.")
                : loading
                  ? t("Checking your device…")
                  : t("Based on the desktop app’s latest status.")}
            </p>
            <button
              disabled={demo || loading || busy}
              onClick={() => void refresh()}
              aria-label={t("Refresh desktop readiness")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-secondary"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {[
              {
                label: t("Speech transcription"),
                detail: t("Whisper model file"),
                key: "whisper",
              },
              {
                label: t("Built-in summary model"),
                detail: t("Optional when another summary provider is selected"),
                key: "llm",
              },
            ].map((model) => (
              <div
                key={model.key}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="text-[13px] font-medium">{model.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {model.detail}
                  </p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${!demo && status?.[model.key] === true ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                >
                  {!demo && !loading && status?.[model.key] === true && (
                    <CheckCircle2 size={12} />
                  )}
                  {demo
                    ? t("Desktop only")
                    : loading
                      ? t("Checking…")
                      : status?.[model.key] === true
                        ? t("File present")
                        : status?.[model.key] === false
                          ? t("Not installed")
                          : t("Unknown")}
                </span>
              </div>
            ))}
          </div>
          {!demo && typeof status?.model_directory === "string" && (
            <div className="rounded-xl bg-secondary p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Folder size={13} />
                {t("Model folder")}
              </p>
              <code className="mt-2 block break-all text-[10px] text-muted-foreground">
                {status.model_directory}
              </code>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {t(
                  "Install the model files using the repository setup instructions, then refresh. File presence does not guarantee successful inference.",
                )}
              </p>
            </div>
          )}
          <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            {capabilities.system_audio === true
              ? t("This build supports system audio capture.")
              : t("System audio capture is not available in this build.")}{" "}
            {capabilities.diarization === true
              ? t("Speaker separation is available.")
              : t("Automatic speaker separation is not available.")}{" "}
            {capabilities.calendar === true
              ? t("Calendar integration is available.")
              : t("Calendar integration is not connected.")}
          </p>
        </Section>
        <Section
          title={t("Import your notes")}
          description={t("Bring your existing conversations with you.")}
          icon={<FileUp size={16} className="text-primary" />}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <h3 className="text-[13px] font-semibold">
                {t("Granola JSON export")}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t(
                  "Choose an exported JSON file up to 20 MB. Imported notes will appear in your desktop library. Other export formats are not currently supported.",
                )}
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label={t("Choose Granola JSON export")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
            <button
              disabled={demo || busy}
              onClick={() => fileRef.current?.click()}
              className="button-secondary shrink-0 gap-2"
            >
              <FileUp size={15} />
              {busy ? t("Working…") : t("Choose JSON export")}
            </button>
          </div>
        </Section>
        <Section
          title={t("Library retention")}
          description={t("Choose how long your conversations stay.")}
          icon={<HardDrive size={16} className="text-primary" />}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            {typeof status?.retention_days === "number"
              ? status.retention_days === 0
                ? t("Current policy: keep all notes.")
                : t("Current policy: remove notes older than {days} days.", {
                    days: status.retention_days,
                  })
              : t(
                  "The current retention policy is not available in this view.",
                )}{" "}
            {t(
              "Deleting notes also removes their transcripts and related items. Export any notes you want to keep first.",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium" htmlFor="retention-policy">
              {t("Keep notes for")}
            </label>
            <select
              id="retention-policy"
              disabled={demo || busy || loading}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="0">{t("Forever")}</option>
              <option value="30">{t("30 days")}</option>
              <option value="90">{t("90 days")}</option>
              <option value="365">{t("1 year")}</option>
              {!["0", "30", "90", "365"].includes(retention) && (
                <option value={retention}>
                  {t("{days} days", { days: Number(retention) })}
                </option>
              )}
            </select>
            <button
              disabled={demo || busy || loading}
              onClick={(event) => {
                confirmationTrigger.current = event.currentTarget;
                setConfirmation("retention");
                setConfirmText("");
                setError("");
              }}
              className="button-secondary"
            >
              {t("Review change")}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/15 bg-destructive/[0.025] p-4">
            <div>
              <h3 className="text-[13px] font-semibold">
                {t("Delete meeting library")}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("Permanently remove saved meetings and their related data.")}
              </p>
            </div>
            <button
              disabled={demo || busy}
              onClick={(event) => {
                confirmationTrigger.current = event.currentTarget;
                setConfirmation("purge");
                setConfirmText("");
                setError("");
              }}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 dark:text-red-400"
            >
              <Trash2 size={14} />
              {t("Delete library")}
            </button>
          </div>
        </Section>
        <p className="text-center text-[10px] text-muted-foreground">
          {t(
            "Open Granola · Apache 2.0 · Built for conversations worth keeping",
          )}
        </p>
        <Dialog
          open={confirmation !== null}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmation(null);
          }}
        >
          <DialogContent
            showCloseButton={!busy}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl p-5 sm:p-6"
            aria-busy={busy}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              confirmationTrigger.current?.focus();
            }}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive dark:text-red-400">
              {confirmation === "purge" ? (
                <Trash2 size={20} />
              ) : (
                <HardDrive size={20} />
              )}
            </span>
            <DialogTitle className="pr-5 text-xl leading-snug">
              {confirmation === "purge"
                ? t("Delete your meeting library?")
                : t("Change note retention?")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              {confirmation === "purge"
                ? t(
                    "This permanently deletes saved meetings, transcripts, action items, and commitments, and resets library settings. Export anything you want to keep before continuing.",
                  )
                : Number(retention)
                  ? t(
                      "Notes older than {days} days may be permanently deleted. Export anything you want to keep before applying this policy.",
                      { days: Number(retention) },
                    )
                  : t(
                      "Notes will be kept until you delete them. Previously deleted notes cannot be recovered.",
                    )}
            </DialogDescription>
            {(confirmation === "purge" || Number(retention) > 0) && (
              <label className="space-y-2 text-xs">
                <span>{t("Type DELETE to confirm")}</span>
                <input
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  disabled={busy}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="block h-11 w-full rounded-xl border border-border bg-card px-3 font-mono text-sm"
                />
              </label>
            )}
            {error && (
              <p
                role="alert"
                className="text-xs text-destructive dark:text-red-400"
              >
                {t(error)}
              </p>
            )}
            <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                disabled={busy}
                onClick={() => setConfirmation(null)}
                className="button-secondary justify-center"
              >
                {t("Cancel")}
              </button>
              <button
                disabled={
                  busy ||
                  ((confirmation === "purge" || Number(retention) > 0) &&
                    confirmText !== "DELETE")
                }
                onClick={() => void apply()}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${confirmation === "purge" || Number(retention) > 0 ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy
                  ? t("Applying…")
                  : confirmation === "purge"
                    ? t("Delete library")
                    : t("Apply policy")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

import {
  AlertCircle,
  Cpu,
  FileUp,
  Folder,
  HardDrive,
  RefreshCw,
  Shield,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getBackend } from "../lib/backend";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <h2 className="flex items-center gap-2 border-b border-border px-5 py-4 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export function SettingsView({
  onLibraryChange,
}: {
  onLibraryChange?: () => void;
}) {
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
  const fileRef = useRef<HTMLInputElement>(null);
  const capabilities =
    status?.capabilities && typeof status.capabilities === "object"
      ? (status.capabilities as Record<string, unknown>)
      : {};

  useEffect(() => {
    if (demo) return;
    let active = true;
    backend
      .modelStatus()
      .then((value) => {
        if (active) setStatus(value);
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
      setStatus(await backend.modelStatus());
    } catch {
      setError("Couldn’t read desktop readiness. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const importFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a JSON export smaller than 20 MB.");
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
        `Imported ${count} meeting${count === 1 ? "" : "s"}. Your library has been refreshed.`,
      );
      onLibraryChange?.();
    } catch {
      setError(
        "Import failed. Check that this is a supported Granola JSON export, then try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      if (confirmation === "purge") {
        await backend.purgeAll();
        setNotice("Your meeting library has been deleted.");
      } else {
        await backend.setRetention(Number(retention));
        setNotice(
          Number(retention)
            ? `Retention set to ${retention} days. Older notes may be removed by the desktop app.`
            : "Automatic retention deletion disabled.",
        );
      }
      setConfirmation(null);
      setConfirmText("");
      onLibraryChange?.();
      await refresh();
    } catch {
      setError(
        "This change could not be completed. Your library may be in use; stop any active session and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-5 pb-24 pt-10 sm:px-8">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            Make yourself at home
          </p>
          <h1 className="font-display mt-2 text-[36px]">Settings</h1>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Know what’s running, where your notes live, and what’s available.
          </p>
        </div>
        {demo && (
          <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed">
              <strong className="font-semibold">
                You’re exploring the browser demo.
              </strong>{" "}
              Meetings are sample data. Audio capture, local AI models, import,
              and library deletion require the desktop app.
            </p>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-border bg-secondary p-4 text-xs leading-relaxed"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-relaxed text-destructive"
          >
            {error}
          </p>
        )}
        <Section
          title="Privacy & storage"
          icon={<Shield size={16} className="text-primary" />}
        >
          <div>
            <h3 className="text-[13px] font-semibold">A local workspace</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              The desktop app stores notes and transcripts in its local
              database. Local storage is not a claim of encryption; your device
              and backups still control who can access those files.
            </p>
          </div>
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold">Network mode</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {demo
                  ? "This page is a browser preview. No network telemetry is measured here."
                  : status?.airlock === true
                    ? "Airlock build enabled. This is an application build setting, not an operating-system firewall or a traffic meter."
                    : status?.airlock === false
                      ? "Airlock is not enabled in this build. Review your desktop configuration before recording."
                      : "Waiting for desktop status. Network usage is not measured in this interface."}
              </p>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">
                Recording responsibly
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Let everyone in the conversation know before recording. Verify
                important details in transcripts and AI summaries.
              </p>
            </div>
          </div>
        </Section>
        <Section
          title="Desktop readiness"
          icon={<Cpu size={16} className="text-primary" />}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {demo
                ? "Model checks are available in the desktop app."
                : loading
                  ? "Checking your device…"
                  : "Based on the desktop app’s latest status."}
            </p>
            <button
              disabled={demo || loading}
              onClick={() => void refresh()}
              aria-label="Refresh desktop readiness"
              className="rounded-lg border border-border p-2 text-muted-foreground"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="divide-y divide-border">
            {[
              {
                label: "Speech transcription",
                detail: "Whisper model file",
                key: "whisper",
              },
              {
                label: "Meeting summaries & assistant",
                detail: "Local language model file",
                key: "llm",
              },
            ].map((model) => (
              <div
                key={model.key}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-[13px] font-medium">{model.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {model.detail}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${!demo && status?.[model.key] === true ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                >
                  {demo
                    ? "Desktop only"
                    : loading
                      ? "Checking…"
                      : status?.[model.key] === true
                        ? "File present"
                        : status?.[model.key] === false
                          ? "Not installed"
                          : "Unknown"}
                </span>
              </div>
            ))}
          </div>
          {!demo && typeof status?.model_directory === "string" && (
            <div className="rounded-xl bg-secondary p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Folder size={13} />
                Model folder
              </p>
              <code className="mt-2 block break-all text-[10px] text-muted-foreground">
                {status.model_directory}
              </code>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                Install the model files using the repository setup instructions,
                then refresh. File presence does not guarantee successful
                inference.
              </p>
            </div>
          )}
          <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            {capabilities.system_audio === true
              ? "This build supports system audio capture."
              : "System audio capture is not available in this build."}{" "}
            {capabilities.diarization === true
              ? "Speaker separation is available."
              : "Automatic speaker separation is not available."}{" "}
            {capabilities.calendar === true
              ? "Calendar integration is available."
              : "Calendar integration is not connected."}
          </p>
        </Section>
        <Section
          title="Import your notes"
          icon={<FileUp size={16} className="text-primary" />}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-md">
              <h3 className="text-[13px] font-semibold">Granola JSON export</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Choose an exported JSON file up to 20 MB. Imported notes will
                appear in your desktop library. Other export formats are not
                currently supported.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Choose Granola JSON export"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
            <button
              disabled={demo || busy}
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold"
            >
              {busy ? "Working…" : "Choose JSON export"}
            </button>
          </div>
        </Section>
        <Section
          title="Library retention"
          icon={<HardDrive size={16} className="text-primary" />}
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            {typeof status?.retention_days === "number"
              ? status.retention_days === 0
                ? "Current policy: keep all notes."
                : `Current policy: remove notes older than ${status.retention_days} days.`
              : "The current retention policy is not available in this view."}{" "}
            Deleting notes also removes their transcripts and related items.
            Export any notes you want to keep first.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium" htmlFor="retention-policy">
              Keep notes for
            </label>
            <select
              id="retention-policy"
              disabled={demo || busy}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="0">Forever</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
            <button
              disabled={demo || busy}
              onClick={() => {
                setConfirmation("retention");
                setConfirmText("");
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
            >
              Review change
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <div>
              <h3 className="text-[13px] font-semibold">
                Delete meeting library
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Permanently remove saved meetings and their related data.
              </p>
            </div>
            <button
              disabled={demo || busy}
              onClick={() => {
                setConfirmation("purge");
                setConfirmText("");
              }}
              className="flex items-center gap-2 rounded-xl border border-destructive/30 px-3 py-2 text-xs font-semibold text-destructive"
            >
              <Trash2 size={14} />
              Delete library
            </button>
          </div>
        </Section>
        <p className="text-center text-[10px] text-muted-foreground">
          Open Granola · Apache 2.0 · Built for conversations worth keeping
        </p>
        <Dialog
          open={confirmation !== null}
          onOpenChange={(open) => {
            if (!open && !busy) setConfirmation(null);
          }}
        >
          <DialogContent>
            <DialogTitle>
              {confirmation === "purge"
                ? "Delete your meeting library?"
                : "Change note retention?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "purge"
                ? "This permanently deletes saved meetings, transcripts, action items, and commitments. Export anything you want to keep before continuing."
                : Number(retention)
                  ? `Notes older than ${retention} days may be permanently deleted. Export anything you want to keep before applying this policy.`
                  : "Notes will be kept until you delete them. Previously deleted notes cannot be recovered."}
            </DialogDescription>
            {(confirmation === "purge" || Number(retention) > 0) && (
              <label className="space-y-2 text-xs">
                <span>Type DELETE to confirm</span>
                <input
                  autoComplete="off"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="block h-10 w-full rounded-lg border border-border bg-background px-3"
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                disabled={busy}
                onClick={() => setConfirmation(null)}
                className="rounded-lg border border-border px-4 py-2 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  ((confirmation === "purge" || Number(retention) > 0) &&
                    confirmText !== "DELETE")
                }
                onClick={() => void apply()}
                className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground"
              >
                {busy
                  ? "Applying…"
                  : confirmation === "purge"
                    ? "Delete library"
                    : "Apply policy"}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

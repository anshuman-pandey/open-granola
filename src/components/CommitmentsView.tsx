import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Handshake,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getBackend } from "../lib/backend";
import type { Commitment } from "../lib/types";

interface Props {
  onOpenMeeting: (id: string) => void;
}

export function CommitmentsView({ onOpenMeeting }: Props) {
  const [items, setItems] = useState<Commitment[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    getBackend()
      .listCommitments()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch(() => {
        if (active)
          setError("Your commitments could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const toggle = async (item: Commitment) => {
    const status = item.status === "kept" ? "open" : "kept";
    setPending((ids) => [...ids, item.id]);
    setError("");
    try {
      await getBackend().markCommitment(item.id, status);
      setItems((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status } : c)),
      );
    } catch {
      setError("That commitment could not be saved. Please try again.");
    } finally {
      setPending((ids) => ids.filter((id) => id !== item.id));
    }
  };
  const shown = items.filter(
    (item) => filter === "all" || item.status !== "kept",
  );
  const openCount = items.filter((item) => item.status !== "kept").length;
  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="workspace-page mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
        <p className="section-eyebrow">Keep track of what comes next</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-[40px] leading-tight tracking-tight sm:text-[48px]">
              Commitments
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Promises recorded in your meetings, with their source close at
              hand.
            </p>
          </div>
          <div
            role="group"
            aria-label="Filter commitments"
            className="flex gap-1 rounded-xl border border-border bg-card p-1"
          >
            {(["open", "all"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${filter === value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                {value === "open" ? "Open" : "All"}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${filter === value ? "bg-background/15" : "bg-secondary"}`}
                >
                  {loading ? "—" : value === "open" ? openCount : items.length}
                </span>
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive dark:text-red-400"
          >
            <span>{error}</span>
            <button
              aria-label="Reload commitments"
              onClick={() => {
                setLoading(true);
                setError("");
                setRevision((r) => r + 1);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-destructive/10"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
        <dl className="surface-card mt-8 grid grid-cols-3 divide-x divide-border">
          {(["open", "overdue", "kept"] as const).map((status) => (
            <div
              key={status}
              className="flex min-w-0 flex-col gap-2 px-2 py-5 text-center sm:px-5 sm:text-left"
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {status}
              </dt>
              <dd
                className={`font-display text-[32px] leading-none tabular-nums sm:text-[36px] ${status === "overdue" && items.some((item) => item.status === "overdue") ? "text-destructive dark:text-red-400" : "text-foreground"}`}
              >
                {loading || (error && !items.length)
                  ? "—"
                  : status === "open"
                    ? openCount
                    : items.filter((c) => c.status === status).length}
              </dd>
            </div>
          ))}
        </dl>
        {loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
          >
            <Loader2 size={16} className="animate-spin" />
            Loading commitments…
          </p>
        ) : shown.length === 0 && !error ? (
          <div className="surface-card mt-6 px-5 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Handshake size={26} />
            </span>
            <h2 className="font-display mt-5 text-[28px]">
              {items.length ? "No open commitments" : "No commitments yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {items.length
                ? "Switch to All to review the promises you’ve kept."
                : "Commitments saved with your meetings will appear here."}
            </p>
            {items.length > 0 && (
              <button
                onClick={() => setFilter("all")}
                className="button-secondary mt-5"
              >
                View kept commitments
              </button>
            )}
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {shown.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-2 rounded-2xl border bg-card p-3 transition-colors sm:gap-3 sm:p-4 ${item.status === "overdue" ? "border-destructive/25" : "border-border"}`}
              >
                <button
                  role="checkbox"
                  aria-checked={item.status === "kept"}
                  aria-busy={pending.includes(item.id)}
                  aria-label={`${item.status === "kept" ? "Reopen" : "Mark kept"}: ${item.text}`}
                  disabled={pending.includes(item.id)}
                  onClick={() => void toggle(item)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-secondary"
                >
                  {pending.includes(item.id) ? (
                    <Loader2 size={19} className="animate-spin text-primary" />
                  ) : item.status === "kept" ? (
                    <CheckCircle2 size={19} className="text-primary" />
                  ) : item.status === "overdue" ? (
                    <Circle
                      size={19}
                      className="text-destructive dark:text-red-400"
                    />
                  ) : (
                    <Circle size={19} className="text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1 py-2">
                  <p
                    className={`break-words text-sm leading-relaxed ${item.status === "kept" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {item.text}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
                    <span className="max-w-full break-words rounded-md bg-secondary px-2 py-1">
                      {item.owner}
                    </span>
                    {item.due && (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays size={12} className="shrink-0" />
                        Due {item.due}
                      </span>
                    )}
                    {item.status === "overdue" && (
                      <span className="flex items-center gap-1 rounded-md bg-destructive/5 px-2 py-1 font-medium text-destructive dark:text-red-400">
                        <AlertTriangle size={12} />
                        Overdue
                      </span>
                    )}
                    {pending.includes(item.id) && (
                      <span role="status">Saving…</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 border-t border-border/60 pt-1">
                    <button
                      onClick={() => onOpenMeeting(item.meetingId)}
                      aria-label={`Open source: ${item.madeIn}`}
                      className="flex min-h-11 max-w-full items-center gap-1.5 rounded-lg text-left text-xs text-muted-foreground transition-colors hover:text-primary"
                    >
                      <span className="truncate">{item.madeIn}</span>
                      <ArrowUpRight size={14} className="shrink-0" />
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.madeOn).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

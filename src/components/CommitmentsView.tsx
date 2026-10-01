import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Handshake,
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
  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          Keep track of what comes next
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[36px]">Commitments</h1>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Promises recorded in your meetings, with their source close at
              hand.
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            {(["open", "all"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === value ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <span>{error}</span>
            <button
              aria-label="Reload commitments"
              onClick={() => {
                setLoading(true);
                setError("");
                setRevision((r) => r + 1);
              }}
              className="rounded-lg p-2"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
        <div className="mt-7 grid grid-cols-3 gap-3">
          {(["open", "overdue", "kept"] as const).map((status) => (
            <div
              key={status}
              className="rounded-2xl border border-border bg-card p-4 text-center"
            >
              <div
                className={`font-display text-[30px] ${status === "overdue" ? "text-destructive" : "text-foreground"}`}
              >
                {loading
                  ? "—"
                  : items.filter((c) => c.status === status).length}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {status}
              </div>
            </div>
          ))}
        </div>
        {loading ? (
          <p
            role="status"
            className="py-12 text-center text-sm text-muted-foreground"
          >
            Loading commitments…
          </p>
        ) : shown.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border py-12 text-center">
            <Handshake size={28} className="mx-auto text-primary" />
            <h2 className="mt-4 text-base font-semibold">
              {items.length ? "No open commitments" : "No commitments yet"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length
                ? "Switch to All to review the promises you’ve kept."
                : "Commitments saved with your meetings will appear here."}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {shown.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-2xl border bg-card p-4 ${item.status === "overdue" ? "border-destructive/30" : "border-border"}`}
              >
                <button
                  role="checkbox"
                  aria-checked={item.status === "kept"}
                  aria-label={`${item.status === "kept" ? "Reopen" : "Mark kept"}: ${item.text}`}
                  disabled={pending.includes(item.id)}
                  onClick={() => void toggle(item)}
                  className="rounded-lg p-1"
                >
                  {item.status === "kept" ? (
                    <CheckCircle2 size={19} className="text-primary" />
                  ) : item.status === "overdue" ? (
                    <AlertTriangle size={19} className="text-destructive" />
                  ) : (
                    <Circle size={19} className="text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[13px] leading-relaxed ${item.status === "kept" ? "text-muted-foreground line-through" : ""}`}
                  >
                    {item.text}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{item.owner}</span>
                    {item.due && (
                      <span
                        className={
                          item.status === "overdue" ? "text-destructive" : ""
                        }
                      >
                        · Due {item.due}
                      </span>
                    )}
                    <span>· {new Date(item.madeOn).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={() => onOpenMeeting(item.meetingId)}
                    className="mt-2 flex max-w-full items-center gap-1.5 text-[10px] text-muted-foreground hover:text-primary"
                  >
                    <span className="truncate">{item.madeIn}</span>
                    <ExternalLink size={11} className="shrink-0" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

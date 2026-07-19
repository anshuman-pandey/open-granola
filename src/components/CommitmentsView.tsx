import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Handshake } from "lucide-react";
import { useEffect, useState } from "react";
import { COMMITMENTS } from "../lib/data";
import { getBackend } from "../lib/backend";

interface Props {
  onOpenMeeting: (id: string) => void;
}

export function CommitmentsView({ onOpenMeeting }: Props) {
  const [items, setItems] = useState(COMMITMENTS);
  const [filter, setFilter] = useState<"open" | "all">("open");

  // Real ledger when running on the Rust backend.
  useEffect(() => {
    if (getBackend().mode === "tauri") {
      getBackend()
        .listCommitments()
        .then((rows) => rows.length > 0 && setItems(rows))
        .catch(() => {});
    }
  }, []);

  const overdue = items.filter((c) => c.status === "overdue").length;
  const open = items.filter((c) => c.status === "open").length;
  const kept = items.filter((c) => c.status === "kept").length;
  const shown = items.filter((c) => filter === "all" || c.status !== "kept");

  const markKept = (id: string) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, status: "kept" as const } : c)));
    getBackend().markCommitment(id, "kept").catch(() => {});
  };

  return (
    <div className="scrollbar-thin paper-texture flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-[32px]">Commitments</h1>
            <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
              Every promise anyone made in any meeting — extracted on-device, tracked across your whole
              library, and resurfaced when it's due.
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            {(["open", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1 text-[12px] font-semibold capitalize ${
                  filter === f ? "bg-foreground text-background" : "text-muted-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* score strip */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { n: open, label: "open", cls: "text-foreground" },
            { n: overdue, label: "overdue", cls: "text-destructive" },
            { n: kept, label: "kept", cls: "text-emerald-700 dark:text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
              <div className={`font-display text-[28px] leading-none ${s.cls}`}>{s.n}</div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {shown.map((c, i) => (
            <div
              key={c.id}
              className={`animate-rise flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${
                c.status === "overdue"
                  ? "border-destructive/40 bg-destructive/5"
                  : c.status === "kept"
                    ? "border-border bg-card opacity-70"
                    : "border-border bg-card"
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <button onClick={() => markKept(c.id)} title="Mark kept">
                {c.status === "kept" ? (
                  <CheckCircle2 size={19} className="text-emerald-600" />
                ) : c.status === "overdue" ? (
                  <AlertTriangle size={19} className="text-destructive" />
                ) : (
                  <Circle size={19} className="text-muted-foreground transition-colors hover:text-primary" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] ${c.status === "kept" ? "text-muted-foreground line-through" : ""}`}>
                  {c.text}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Handshake size={11} />
                  <span>
                    {c.owner} · promised in “{c.madeIn}” · {c.ageDays}d ago
                  </span>
                  <button
                    onClick={() => onOpenMeeting(c.meetingId)}
                    className="text-muted-foreground transition-colors hover:text-primary"
                    title="Open source meeting"
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
              {c.due && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    c.status === "overdue"
                      ? "bg-destructive/15 text-destructive"
                      : c.status === "kept"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-primary/10 text-primary"
                  }`}
                >
                  {c.status === "overdue" ? "overdue · " : ""}
                  {c.due}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-[11.5px] text-muted-foreground">
          Sotto detects commitments with the on-device model — phrases like “I'll have it by Friday” — and never
          shames anyone publicly. This ledger is yours alone.
        </p>
      </div>
    </div>
  );
}

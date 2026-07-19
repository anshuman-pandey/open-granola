import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { useState } from "react";
import { ACTION_ITEMS } from "../lib/data";

interface Props {
  onOpenMeeting: (id: string) => void;
  onToggle?: (id: string, done: boolean) => void;
}

export function ActionItemsView({ onOpenMeeting, onToggle }: Props) {
  const [items, setItems] = useState(ACTION_ITEMS);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const shown = items.filter((a) => filter === "all" || !a.done);
  const byMeeting = shown.reduce<Record<string, typeof shown>>((acc, a) => {
    (acc[a.meetingTitle] ||= []).push(a);
    return acc;
  }, {});

  return (
    <div className="scrollbar-thin paper-texture flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-8 pb-16 pt-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-[32px]">Action items</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Extracted automatically from every meeting, tracked in one place — with owners and due dates.
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

        <div className="mt-6 space-y-6">
          {Object.entries(byMeeting).map(([title, list], gi) => (
            <div key={title} className="animate-rise" style={{ animationDelay: `${gi * 60}ms` }}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
              <div className="space-y-2">
                {list.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm"
                  >
                    <button
                      onClick={() => {
                        setItems((prev) => prev.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)));
                        onToggle?.(a.id, !a.done);
                      }}
                    >
                      {a.done ? (
                        <CheckCircle2 size={19} className="text-emerald-600" />
                      ) : (
                        <Circle size={19} className="text-muted-foreground transition-colors hover:text-primary" />
                      )}
                    </button>
                    <span className={`flex-1 text-[13.5px] ${a.done ? "text-muted-foreground line-through" : ""}`}>
                      {a.text}
                    </span>
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                      {a.owner}
                    </span>
                    {a.due && (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        {a.due}
                      </span>
                    )}
                    <button
                      onClick={() => onOpenMeeting(a.meetingId)}
                      className="text-muted-foreground transition-colors hover:text-primary"
                      title="Open source meeting"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

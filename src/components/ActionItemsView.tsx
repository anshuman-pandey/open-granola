import { CheckCircle2, Circle, ExternalLink, ListChecks } from "lucide-react";
import { useState } from "react";
import type { ActionItem } from "../lib/types";

interface Props {
  items?: ActionItem[];
  onOpenMeeting: (id: string) => void;
  onToggle?: (id: string, done: boolean) => Promise<void> | void;
}

export function ActionItemsView({
  items = [],
  onOpenMeeting,
  onToggle,
}: Props) {
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState("");
  const shown = items.filter((a) => filter === "all" || !a.done);
  const groups = shown.reduce<Record<string, ActionItem[]>>((acc, item) => {
    (acc[item.meetingId] ||= []).push(item);
    return acc;
  }, {});
  const toggle = async (item: ActionItem) => {
    setPending((ids) => [...ids, item.id]);
    setError("");
    try {
      await onToggle?.(item.id, !item.done);
    } catch {
      setError("This change couldn’t be saved. Please try again.");
    } finally {
      setPending((ids) => ids.filter((id) => id !== item.id));
    }
  };
  return (
    <div className="scrollbar-thin paper-texture min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
          From conversation to action
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[36px]">Action items</h1>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
              {items.filter((a) => !a.done).length} open next steps across your
              meetings. Review the source before following up.
              {items.length >= 5000 &&
                " Showing up to 5,000 action items; open a source meeting for its complete list."}
            </p>
          </div>
          <div
            className="flex gap-1 rounded-xl border border-border bg-card p-1"
            aria-label="Filter action items"
          >
            {(["open", "all"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filter === value ? "bg-foreground text-background" : "text-muted-foreground"}`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
          >
            {error}
          </p>
        )}
        {!shown.length && (
          <div className="mt-8 rounded-2xl border border-dashed border-border px-5 py-12 text-center">
            <ListChecks size={30} className="mx-auto text-primary" />
            <h2 className="mt-4 text-base font-semibold">
              {items.length ? "You’re all caught up" : "No action items yet"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length
                ? "Switch to All to review completed items."
                : "Action items from saved meetings will appear here."}
            </p>
          </div>
        )}
        <div className="mt-7 space-y-7">
          {Object.entries(groups).map(([meetingId, list]) => (
            <section key={meetingId}>
              <button
                onClick={() => onOpenMeeting(meetingId)}
                className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"
              >
                {list[0].meetingTitle}
                <ExternalLink size={12} />
              </button>
              <div className="space-y-2">
                {list.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <button
                      disabled={!onToggle || pending.includes(item.id)}
                      role="checkbox"
                      aria-checked={item.done}
                      aria-label={`${item.done ? "Reopen" : "Complete"}: ${item.text}`}
                      onClick={() => void toggle(item)}
                      className="rounded-full p-1"
                    >
                      {item.done ? (
                        <CheckCircle2 size={19} className="text-primary" />
                      ) : (
                        <Circle size={19} className="text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[13px] leading-relaxed ${item.done ? "text-muted-foreground line-through" : ""}`}
                      >
                        {item.text}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="rounded-md bg-secondary px-2 py-1">
                          {item.owner}
                        </span>
                        {item.due && <span>Due {item.due}</span>}
                        {pending.includes(item.id) && (
                          <span role="status">Saving…</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenMeeting(item.meetingId)}
                      aria-label={`Open source: ${item.meetingTitle}`}
                      title="Open source meeting"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

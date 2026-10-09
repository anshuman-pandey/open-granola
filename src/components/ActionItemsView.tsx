import { useI18n } from "../i18n";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  ListChecks,
  Loader2,
} from "lucide-react";
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
  const { t, formatNumber } = useI18n();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState("");
  const openCount = items.filter((item) => !item.done).length;
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
      <div className="workspace-page mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
        <p className="section-eyebrow">{t("From conversation to action")}</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-[40px] leading-tight tracking-tight sm:text-[48px]">
              {t("Action items")}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t(
                "The next steps from your meetings, all in one place. Review the source before following up.",
              )}
              {items.length >= 5000 &&
                ` ${t("Showing up to {count} action items; open a source meeting for its complete list.", { count: 5000 })}`}
            </p>
          </div>
          <div
            className="flex gap-1 rounded-xl border border-border bg-card p-1"
            role="group"
            aria-label={t("Filter action items")}
          >
            {(["open", "all"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${filter === value ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              >
                {value === "open" ? t("Open") : t("All")}
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${filter === value ? "bg-background/15" : "bg-secondary"}`}
                >
                  {formatNumber(value === "open" ? openCount : items.length)}
                </span>
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive dark:text-red-400"
          >
            {t(error)}
          </p>
        )}
        {!shown.length && (
          <div className="surface-card mt-8 px-5 py-14 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ListChecks size={26} />
            </span>
            <h2 className="font-display mt-5 text-[28px]">
              {items.length
                ? t("You’re all caught up")
                : t("No action items yet")}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {items.length
                ? t("Switch to All to review completed items.")
                : t("Action items from saved meetings will appear here.")}
            </p>
            {items.length > 0 && (
              <button
                onClick={() => setFilter("all")}
                className="button-secondary mt-5"
              >
                {t("View completed items")}
              </button>
            )}
          </div>
        )}
        <div className="mt-8 space-y-7">
          {Object.entries(groups).map(([meetingId, list]) => (
            <section key={meetingId}>
              <button
                onClick={() => onOpenMeeting(meetingId)}
                className="group mb-2 flex min-h-11 max-w-full items-center gap-2 rounded-lg text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
              >
                <span className="break-words">{list[0].meetingTitle}</span>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
                <span className="ml-1 shrink-0 font-normal tabular-nums">
                  {formatNumber(list.length)}
                </span>
              </button>
              <ul className="surface-card divide-y divide-border overflow-hidden">
                {list.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 p-3 transition-colors hover:bg-secondary/25 sm:gap-3 sm:p-4"
                  >
                    <button
                      disabled={!onToggle || pending.includes(item.id)}
                      role="checkbox"
                      aria-checked={item.done}
                      aria-busy={pending.includes(item.id)}
                      aria-label={t(
                        item.done ? "Reopen: {text}" : "Complete: {text}",
                        { text: item.text },
                      )}
                      onClick={() => void toggle(item)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-secondary"
                    >
                      {pending.includes(item.id) ? (
                        <Loader2
                          size={19}
                          className="animate-spin text-primary"
                        />
                      ) : item.done ? (
                        <CheckCircle2 size={19} className="text-primary" />
                      ) : (
                        <Circle size={19} className="text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1 py-2">
                      <p
                        className={`break-words text-sm leading-relaxed ${item.done ? "text-muted-foreground line-through" : ""}`}
                      >
                        {item.text}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
                        <span className="max-w-full break-words rounded-md bg-secondary px-2 py-1">
                          {item.owner}
                        </span>
                        {item.due && (
                          <span className="flex items-center gap-1.5">
                            <CalendarDays size={12} className="shrink-0" />
                            {t("Due {date}", { date: item.due })}
                          </span>
                        )}
                        {pending.includes(item.id) && (
                          <span role="status">{t("Saving…")}</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenMeeting(item.meetingId)}
                      aria-label={t("Open source: {title}", {
                        title: item.meetingTitle,
                      })}
                      title={t("Open source meeting")}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

import { CheckSquare, FileText, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ACTION_ITEMS } from "../lib/data";
import type { Meeting } from "../lib/types";

interface Props {
  meetings: Meeting[];
  onClose: () => void;
  onOpenMeeting: (id: string) => void;
  onOpenActions: () => void;
}

export function CommandPalette({ meetings, onClose, onOpenMeeting, onOpenActions }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => {
    const needle = q.toLowerCase();
    const hits: { id: string; kind: "meeting" | "action"; title: string; sub: string; ref: string }[] = [];
    meetings.forEach((m) => {
      if (!needle || m.title.toLowerCase().includes(needle) || m.summary.toLowerCase().includes(needle)) {
        hits.push({ id: `m-${m.id}`, kind: "meeting", title: m.title, sub: m.template, ref: m.id });
      }
    });
    ACTION_ITEMS.forEach((a) => {
      if (needle && a.text.toLowerCase().includes(needle)) {
        hits.push({ id: `a-${a.id}`, kind: "action", title: a.text, sub: `${a.owner} · ${a.meetingTitle}`, ref: a.meetingId });
      }
    });
    return hits.slice(0, 8);
  }, [q, meetings]);

  useEffect(() => setIdx(0), [q]);

  const pick = (ref: string) => {
    onOpenMeeting(ref);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[14vh] backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-rise w-[min(560px,90vw)] overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} className="text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && results[idx]) pick(results[idx].ref);
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search meetings, transcripts, action items…"
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70"
          />
          <span className="flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            <Sparkles size={10} /> semantic + keyword
          </span>
        </div>
        <div className="max-h-[320px] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">No local matches for “{q}”.</p>
          )}
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseEnter={() => setIdx(i)}
              onClick={() => (r.kind === "action" ? onOpenActions() : pick(r.ref))}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                i === idx ? "bg-secondary" : ""
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${r.kind === "meeting" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent-foreground"}`}>
                {r.kind === "meeting" ? <FileText size={14} /> : <CheckSquare size={14} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border px-4 py-2 text-[10.5px] text-muted-foreground">
          Search runs against the on-device embedding index — nothing is sent anywhere.
        </div>
      </div>
    </div>
  );
}

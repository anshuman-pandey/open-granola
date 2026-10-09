import { useI18n } from "../i18n";
import { CheckSquare, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit } from "../lib/backend";
import type { ActionItem, Meeting } from "../lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

interface Props {
  meetings: Meeting[];
  actionItems?: ActionItem[];
  onClose: () => void;
  onOpenMeeting: (id: string) => void;
  onOpenActions: () => void;
  searchFn?: (q: string) => Promise<SearchHit[]>;
}

export function CommandPalette({
  meetings,
  actionItems = [],
  onClose,
  onOpenMeeting,
  onOpenActions,
  searchFn,
}: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [remote, setRemote] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const openerRef = useRef(document.activeElement as HTMLElement | null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchFn || !query.trim()) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      searchFn(query.trim())
        .then((hits) => {
          if (active) setRemote(hits);
        })
        .catch(() => {
          if (active) {
            setRemote([]);
            setError(true);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, searchFn]);

  const results = useMemo(() => {
    if (searchFn && query.trim()) return remote.slice(0, 10);
    const needle = query.trim().toLowerCase();
    const hits: SearchHit[] = meetings
      .filter(
        (m) =>
          !needle ||
          [m.title, m.summary, ...m.transcript.map((s) => s.text)]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .map((m) => ({
        id: `m-${m.id}`,
        kind: "meeting",
        title: m.title,
        sub: m.template,
        ref: m.id,
      }));
    if (needle)
      actionItems
        .filter((a) => a.text.toLowerCase().includes(needle))
        .forEach((a) =>
          hits.push({
            id: `a-${a.id}`,
            kind: "action",
            title: a.text,
            sub: `${a.owner} · ${a.meetingTitle}`,
            ref: a.meetingId,
          }),
        );
    return hits.slice(0, 10);
  }, [query, meetings, actionItems, searchFn, remote]);
  useEffect(() => {
    resultsRef.current
      ?.querySelector(`[data-result-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const pick = (hit: SearchHit) => {
    if (hit.kind === "action") onOpenActions();
    else onOpenMeeting(hit.ref);
    onClose();
  };
  const currentIndex = Math.min(index, Math.max(0, results.length - 1));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[580px]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          openerRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">
          {t("Search your meeting library")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t(
            "Search meetings and action items. Use the arrow keys to select a result and Enter to open it.",
          )}
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4 py-4 pr-12">
          <Search size={18} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={t("Search meetings and transcripts")}
            aria-expanded="true"
            aria-controls="library-search-results"
            aria-autocomplete="list"
            aria-activedescendant={
              results[currentIndex]
                ? `search-result-${currentIndex}`
                : undefined
            }
            value={query}
            maxLength={500}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
              setRemote([]);
              setError(false);
              setLoading(Boolean(searchFn && e.target.value.trim()));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) =>
                  Math.min(i + 1, Math.max(0, results.length - 1)),
                );
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && results[currentIndex]) {
                e.preventDefault();
                pick(results[currentIndex]);
              }
            }}
            placeholder={t("Search meetings, transcripts, actions…")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div
          ref={resultsRef}
          id="library-search-results"
          role="listbox"
          aria-label={t("Search results")}
          aria-busy={loading}
          className="max-h-[min(380px,60dvh)] overflow-y-auto p-2"
        >
          {loading && (
            <p
              role="status"
              className="px-3 py-8 text-center text-sm text-muted-foreground"
            >
              {t("Searching your library…")}
            </p>
          )}
          {!loading && error && (
            <p
              role="alert"
              className="px-3 py-8 text-center text-sm text-destructive"
            >
              {t(
                "Search could not finish. Try a shorter search or reopen the library.",
              )}
            </p>
          )}
          {!loading && !error && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {query
                ? t("No matches for “{query}”. Try another word.", { query })
                : t(
                    "Your library is empty. Import or capture a meeting to get started.",
                  )}
            </p>
          )}
          {!loading &&
            results.map((hit, i) => (
              <button
                key={hit.id}
                id={`search-result-${i}`}
                data-result-index={i}
                role="option"
                aria-selected={i === currentIndex}
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(hit)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left ${i === currentIndex ? "bg-secondary" : ""}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {hit.kind === "meeting" ? (
                    <FileText size={16} />
                  ) : (
                    <CheckSquare size={16} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">
                    {hit.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {hit.sub}
                  </span>
                </span>
              </button>
            ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[10px] text-muted-foreground">
          <span>
            {t("Keyword search ·")}
            {searchFn ? t("desktop library") : t("sample workspace")}
          </span>
          <span>
            {t("↑↓ Navigate")}
            <span className="mx-1.5">{t("↵ Open")}</span>
            {t("Esc Close")}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

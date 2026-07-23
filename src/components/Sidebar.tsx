import {
  CheckSquare,
  Handshake,
  Home,
  LayoutTemplate,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Sun,
  Video,
} from "lucide-react";
import type { Meeting, View } from "../lib/types";
import { AvatarStack } from "./Avatar";

interface Props {
  meetings: Meeting[];
  view: View;
  onNavigate: (v: View) => void;
  onOpenSearch: () => void;
  onRecord: () => void;
  recording: boolean;
  onStop: () => void;
  dark: boolean;
  onToggleDark: () => void;
}

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date("2026-07-19T12:00:00");
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This week";
  return "Earlier";
}

export function Sidebar(p: Props) {
  const groups: Record<string, Meeting[]> = {};
  [...p.meetings]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .forEach((m) => {
      const g = groupLabel(m.date);
      (groups[g] ||= []).push(m);
    });

  const navItem = (
    icon: React.ReactNode,
    label: string,
    active: boolean,
    onClick: () => void,
    kbd?: string,
  ) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
      }`}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {kbd && (
        <kbd className="rounded border border-sidebar-border bg-background/60 px-1 text-[10px] text-muted-foreground">
          {kbd}
        </kbd>
      )}
    </button>
  );

  const selId = p.view.kind === "meeting" ? p.view.id : null;

  return (
    <aside className="flex h-full w-[264px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background">
      {/* wordmark */}
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <div className="ember-gradient flex h-8 w-8 items-center justify-center rounded-xl shadow-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.5" r="2.6" fill="white" />
          </svg>
        </div>
        <div>
          <div className="font-display text-[19px] leading-none">Open Granola</div>
          <div className="text-[10.5px] text-muted-foreground">local-first meeting notes</div>
        </div>
        <button
          onClick={p.onToggleDark}
          className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          title="Toggle theme"
        >
          {p.dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* record */}
      <div className="px-3 pb-2 pt-1">
        {p.recording ? (
          <button
            onClick={p.onStop}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-destructive px-3 py-2.5 text-[13px] font-semibold text-destructive-foreground shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            <Square size={13} fill="currentColor" /> Stop & enhance
          </button>
        ) : (
          <button
            onClick={p.onRecord}
            className="ember-gradient flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] active:scale-[0.99]"
          >
            <Video size={15} /> Capture meeting
          </button>
        )}
        <p className="mt-1.5 text-center text-[10.5px] text-muted-foreground">
          No bot joins. Audio never leaves this device.
        </p>
      </div>

      {/* nav */}
      <nav className="space-y-0.5 px-3 py-1">
        <button
          onClick={p.onOpenSearch}
          className="flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-background/50 px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search everything…</span>
          <kbd className="rounded border border-sidebar-border px-1 text-[10px]">⌘K</kbd>
        </button>
        {navItem(<Home size={14} />, "Home", p.view.kind === "home", () => p.onNavigate({ kind: "home" }))}
        {navItem(
          <CheckSquare size={14} />,
          "Action items",
          p.view.kind === "actions",
          () => p.onNavigate({ kind: "actions" }),
        )}
        {navItem(
          <Handshake size={14} />,
          "Commitments",
          p.view.kind === "commitments",
          () => p.onNavigate({ kind: "commitments" }),
        )}
        {navItem(
          <LayoutTemplate size={14} />,
          "Templates",
          p.view.kind === "templates",
          () => p.onNavigate({ kind: "templates" }),
        )}
        {navItem(
          <Settings size={14} />,
          "Settings",
          p.view.kind === "settings",
          () => p.onNavigate({ kind: "settings" }),
        )}
      </nav>

      {/* meeting list */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-2">
        {Object.entries(groups).map(([g, ms]) => (
          <div key={g} className="mt-3">
            <div className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              {g}
            </div>
            <div className="space-y-0.5">
              {ms.map((m) => (
                <button
                  key={m.id}
                  onClick={() => p.onNavigate({ kind: "meeting", id: m.id })}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                    selId === m.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium">{m.title}</span>
                    {m.starred && <span className="text-accent">★</span>}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <AvatarStack people={m.participants} max={3} />
                    <span className="text-[10.5px] text-muted-foreground">{m.durationMin}m</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* airlock status */}
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          <ShieldCheck size={14} />
          Airlock on — 0 network calls
        </div>
        <div className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
          Whisper + Qwen running on-device. Notes stored locally, nothing retained elsewhere.
        </div>
      </div>
    </aside>
  );
}

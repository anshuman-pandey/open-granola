import {
  CheckSquare,
  FileText,
  Handshake,
  Home,
  LayoutTemplate,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Square,
  Sun,
  Video,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { getBackend } from "../lib/backend";
import type { Meeting, View } from "../lib/types";
import { AvatarStack } from "./Avatar";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./ui/sheet";

interface Props {
  meetings: Meeting[];
  view: View;
  onNavigate: (v: View) => void;
  onOpenSearch: () => void;
  onRecord: () => void;
  recording: boolean;
  busy?: boolean;
  onStop: () => void;
  dark: boolean;
  onToggleDark: () => void;
}

function groupLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (+date >= +weekStart && +date <= +today) return "This week";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function Sidebar(p: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const demo = getBackend().mode === "demo";
  const groups: Record<string, Meeting[]> = {};
  [...p.meetings]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .forEach((meeting) => {
      (groups[groupLabel(meeting.date)] ||= []).push(meeting);
    });
  const navigate = (view: View) => {
    p.onNavigate(view);
    setMobileOpen(false);
  };
  const navItem = (icon: ReactNode, label: string, view: View) => {
    const active = p.view.kind === view.kind;
    return (
      <button
        key={view.kind}
        onClick={() => navigate(view)}
        aria-current={active ? "page" : undefined}
        className={`group flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-[12px] font-medium transition-colors md:min-h-10 ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground"}`}
      >
        <span
          className={
            active
              ? "text-primary"
              : "text-muted-foreground group-hover:text-sidebar-foreground"
          }
        >
          {icon}
        </span>
        <span className="flex-1 text-left">{label}</span>
        {active && (
          <span
            className="h-1 w-1 rounded-full bg-primary/70"
            aria-hidden="true"
          />
        )}
      </button>
    );
  };
  const content = (
    <>
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <div
          className="ember-gradient flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl shadow-sm"
          aria-hidden="true"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.5" r="2.6" fill="white" />
          </svg>
        </div>
        <div className="min-w-0">
          <div className="font-display text-[22px] leading-none tracking-[-0.025em]">
            Open Granola
          </div>
          <div className="mt-1 text-[9px] text-muted-foreground">
            local-first meeting notes
          </div>
        </div>
        <button
          onClick={p.onToggleDark}
          aria-hidden={mobileOpen || undefined}
          tabIndex={mobileOpen ? -1 : 0}
          className={`ml-auto flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground ${mobileOpen ? "invisible" : ""}`}
          aria-label={`Use ${p.dark ? "light" : "dark"} theme`}
          title={`Use ${p.dark ? "light" : "dark"} theme`}
        >
          {p.dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
      <div className="px-3 pb-4">
        <button
          disabled={p.busy}
          onClick={p.recording ? p.onStop : p.onRecord}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-[12px] font-semibold shadow-sm md:min-h-10 ${p.recording ? "bg-destructive text-destructive-foreground" : "button-primary"}`}
        >
          {p.recording ? (
            <Square size={13} fill="currentColor" />
          ) : (
            <Video size={14} />
          )}
          {p.busy
            ? "Please wait…"
            : p.recording
              ? "Finish session"
              : demo
                ? "Try a demo session"
                : "Capture meeting"}
        </button>
        <p className="mt-2 text-center text-[9px] leading-relaxed text-muted-foreground">
          {demo
            ? "Simulated transcript · no audio recorded"
            : "Microphone capture · notes stored locally"}
        </p>
      </div>
      <nav aria-label="Workspace" className="space-y-0.5 px-3">
        <button
          onClick={() => {
            p.onOpenSearch();
            setMobileOpen(false);
          }}
          className="mb-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-sidebar-border bg-card/65 px-3 text-[11.5px] md:min-h-10 text-muted-foreground transition-colors hover:border-primary/25 hover:bg-card"
        >
          <Search size={13} />
          <span className="flex-1 text-left">Search your notes</span>
          <kbd className="rounded border border-sidebar-border/80 bg-background/70 px-1 py-0.5 text-[8px] leading-none">
            ⌘/Ctrl K
          </kbd>
        </button>
        {navItem(<Home size={14} />, "Home", { kind: "home" })}
        {navItem(<CheckSquare size={14} />, "Action items", {
          kind: "actions",
        })}
        {navItem(<Handshake size={14} />, "Commitments", {
          kind: "commitments",
        })}
        {navItem(<LayoutTemplate size={14} />, "Templates", {
          kind: "templates",
        })}
      </nav>
      <div className="mx-5 mb-1 mt-5 flex items-center justify-between border-t border-sidebar-border/70 pt-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        <span>Meeting library</span>
        <span className="font-normal tabular-nums">{p.meetings.length}</span>
      </div>
      <nav
        aria-label="Meetings"
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {p.meetings.length === 0 && (
          <div className="mx-2 mt-4 rounded-xl border border-dashed border-sidebar-border p-4">
            <FileText size={16} className="text-muted-foreground/70" />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              A home for your conversations. Saved meetings will appear here.
            </p>
          </div>
        )}
        {Object.entries(groups).map(([label, meetings]) => (
          <div key={label} className="mt-3">
            <div className="flex items-center gap-2 px-3 pb-1.5">
              <span className="text-[9px] font-medium text-muted-foreground">
                {label}
              </span>
              <span className="h-px flex-1 bg-sidebar-border/50" />
            </div>
            <div className="space-y-1">
              {meetings.map((meeting) => {
                const selected =
                  p.view.kind === "meeting" && p.view.id === meeting.id;
                return (
                  <button
                    key={meeting.id}
                    onClick={() =>
                      navigate({ kind: "meeting", id: meeting.id })
                    }
                    aria-current={selected ? "page" : undefined}
                    title={meeting.title}
                    className={`group relative w-full rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"}`}
                  >
                    {selected && (
                      <span
                        className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11.5px] font-medium leading-snug">
                        {meeting.title}
                      </span>
                      {meeting.starred && (
                        <span
                          className="shrink-0 text-[10px] text-primary"
                          aria-label="Starred"
                        >
                          ★
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <AvatarStack people={meeting.participants} max={3} />
                      <span className="text-[9px] tabular-nums text-muted-foreground">
                        {meeting.durationMin} min
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border px-3 pb-4 pt-2">
        <div className="flex items-center gap-1">
          {navItem(<Settings size={14} />, "Settings", { kind: "settings" })}
          {mobileOpen && (
            <button
              onClick={p.onToggleDark}
              aria-label={`Use ${p.dark ? "light" : "dark"} theme`}
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent"
            >
              {p.dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          )}
        </div>
        <div className="mx-1 mt-3 rounded-xl border border-sidebar-border/70 bg-card/45 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-sidebar-foreground">
            <Shield size={12} className="text-primary" />
            {demo
              ? "You’re in the browser demo"
              : "Your notes stay on this device"}
          </div>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            {demo
              ? "Sample meetings, ready to explore. Changes last for this session."
              : "View model readiness and privacy details in Settings."}
          </p>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="mobile-workspace-header fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-secondary"
        >
          <Menu size={19} />
        </button>
        <span className="font-display text-[23px] tracking-tight">
          Open Granola
        </span>
        <button
          onClick={p.onOpenSearch}
          aria-label="Search library"
          className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-secondary"
        >
          <Search size={18} />
        </button>
      </div>
      <aside className="hidden h-full w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex xl:w-[264px]">
        {content}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[290px] flex-col gap-0 bg-sidebar p-0 [&>button:last-child]:right-3 [&>button:last-child]:top-3 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center"
        >
          <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Browse meetings, action items, templates, and settings.
          </SheetDescription>
          {content}
        </SheetContent>
      </Sheet>
    </>
  );
}

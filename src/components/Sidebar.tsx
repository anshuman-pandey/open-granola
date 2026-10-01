import {
  CheckSquare,
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
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (+date >= +today - 7 * 86400000 && +date <= +today) return "This week";
  return "Earlier";
}

export function Sidebar(p: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const demo = getBackend().mode === "demo";
  const groups: Record<string, Meeting[]> = {};
  [...p.meetings]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .forEach((m) => {
      (groups[groupLabel(m.date)] ||= []).push(m);
    });
  const navigate = (view: View) => {
    p.onNavigate(view);
    setMobileOpen(false);
  };
  const navItem = (icon: ReactNode, label: string, view: View) => (
    <button
      key={view.kind}
      onClick={() => navigate(view)}
      aria-current={p.view.kind === view.kind ? "page" : undefined}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-[13px] font-medium transition-colors ${p.view.kind === view.kind ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  const content = (
    <>
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <div
          className="ember-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
          aria-hidden="true"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
          <div className="font-display text-[21px] leading-none">
            Open Granola
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Your meeting workspace
          </div>
        </div>
      </div>
      <div className="px-3 pb-4">
        <button
          disabled={p.busy}
          onClick={p.recording ? p.onStop : p.onRecord}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-semibold shadow-sm ${p.recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
        >
          {p.recording ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <Video size={16} />
          )}
          {p.busy
            ? "Please wait…"
            : p.recording
              ? "Finish session"
              : demo
                ? "Try a demo session"
                : "Capture meeting"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {demo
            ? "Simulated transcript · no audio recorded"
            : "Check capture readiness in Settings"}
        </p>
      </div>
      <nav aria-label="Workspace" className="space-y-1 px-3">
        <button
          onClick={() => {
            p.onOpenSearch();
            setMobileOpen(false);
          }}
          className="mb-3 flex min-h-10 w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-background/70 px-3 text-[13px] text-muted-foreground hover:bg-sidebar-accent/60"
        >
          <Search size={15} />
          <span className="flex-1 text-left">Search library</span>
          <kbd className="rounded border border-sidebar-border px-1 text-[10px]">
            ⌘/Ctrl K
          </kbd>
        </button>
        {navItem(<Home size={16} />, "Overview", { kind: "home" })}
        {navItem(<CheckSquare size={16} />, "Action items", {
          kind: "actions",
        })}
        {navItem(<Handshake size={16} />, "Commitments", {
          kind: "commitments",
        })}
        {navItem(<LayoutTemplate size={16} />, "Templates", {
          kind: "templates",
        })}
      </nav>
      <div className="mt-6 flex items-center justify-between px-6 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <span>Meeting library</span>
        <span>{p.meetings.length}</span>
      </div>
      <nav
        aria-label="Meetings"
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {p.meetings.length === 0 && (
          <p className="px-3 py-5 text-[12px] leading-relaxed text-muted-foreground">
            Your saved meetings will appear here.
          </p>
        )}
        {Object.entries(groups).map(([label, meetings]) => (
          <div key={label} className="mt-4">
            <div className="px-3 pb-2 text-[10px] font-medium text-muted-foreground">
              {label}
            </div>
            <div className="space-y-1">
              {meetings.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate({ kind: "meeting", id: m.id })}
                  aria-current={
                    p.view.kind === "meeting" && p.view.id === m.id
                      ? "page"
                      : undefined
                  }
                  className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${p.view.kind === "meeting" && p.view.id === m.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"}`}
                >
                  <div className="truncate text-[12px] font-medium">
                    {m.title}
                    {m.starred && (
                      <span className="ml-1 text-primary" aria-label="Starred">
                        ★
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <AvatarStack people={m.participants} max={3} />
                    <span className="text-[10px] text-muted-foreground">
                      {m.durationMin} min
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-1">
          {navItem(<Settings size={16} />, "Settings", { kind: "settings" })}
          <button
            onClick={p.onToggleDark}
            className="shrink-0 rounded-xl p-3 text-muted-foreground hover:bg-sidebar-accent"
            aria-label={`Use ${p.dark ? "light" : "dark"} theme`}
            title={`Use ${p.dark ? "light" : "dark"} theme`}
          >
            {p.dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
        <div className="rounded-xl border border-sidebar-border bg-background/60 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            <Shield size={13} className="text-primary" />
            {demo ? "Browser demo" : "Desktop workspace"}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {demo
              ? "Explore with sample meetings. No local models run in this preview."
              : "Notes are stored on this device. Model and privacy details are in Settings."}
          </p>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="mobile-workspace-header fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg p-2 hover:bg-secondary"
        >
          <Menu size={20} />
        </button>
        <span className="font-display text-xl">Open Granola</span>
        <button
          onClick={p.onOpenSearch}
          aria-label="Search library"
          className="ml-auto rounded-lg p-2 hover:bg-secondary"
        >
          <Search size={19} />
        </button>
      </div>
      <aside className="hidden h-full w-[244px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background md:flex xl:w-[264px]">
        {content}
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex w-[290px] flex-col gap-0 bg-sidebar-background p-0"
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

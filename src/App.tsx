import { useCallback, useEffect, useState } from "react";
import { CaptureBar } from "./components/CaptureBar";
import { CommandPalette } from "./components/CommandPalette";
import { HomeView } from "./components/HomeView";
import { NoteView } from "./components/NoteView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { ActionItemsView } from "./components/ActionItemsView";
import { TemplatesView } from "./components/TemplatesView";
import { MEETINGS, PEOPLE } from "./lib/data";
import { useLiveSession, type LiveLine } from "./hooks/useLiveSession";
import type { Meeting, View } from "./lib/types";

export default function App() {
  const [dark, setDark] = useState(false);
  const [view, setView] = useState<View>({ kind: "home" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>(MEETINGS);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleLiveFinish = useCallback((lines: LiveLine[]) => {
    if (lines.length === 0) return;
    const speakers = [...new Set(lines.map((l) => l.speaker))];
    const meeting: Meeting = {
      id: `m-live-${Date.now()}`,
      title: "Aurora checkpoint — onboarding funnel",
      date: new Date().toISOString(),
      durationMin: Math.max(1, Math.round(lines.join(" ").split(" ").length / 150)),
      participants: [
        PEOPLE.you,
        ...speakers.filter((s) => s !== "You").map((s) => Object.values(PEOPLE).find((p) => p.name === s) ?? PEOPLE.devon),
      ],
      tags: ["aurora", "live"],
      template: "Product sync",
      summary:
        "The team diagnosed a 61% drop-off at the workspace-invite step of onboarding. Priya's cohort data suggests deferring invites until day two lifts activation by roughly eight points. The reordered flow ships flag-gated Friday as a 50/50 split.",
      chapters: [
        {
          title: "Where users bail",
          timestamp: "00:20",
          body: "Step three — the workspace invite screen — loses 61% of new users, 3.4× the funnel median.",
        },
        {
          title: "The fix",
          timestamp: "01:40",
          body: "Defer invites until after the first project exists. Beta data projects an ~8-point activation lift.",
        },
        {
          title: "Rollout",
          timestamp: "03:10",
          body: "Flag-gated 50/50 split shipping Friday. Priya monitors the activation dashboard.",
        },
      ],
      decisions: [
        "Defer team invites to day two of onboarding",
        "Ship reordered flow flag-gated Friday as a 50/50 experiment",
      ],
      transcript: lines.map((l, i) => ({
        id: l.id,
        speakerId: l.speaker === "You" ? "you" : (Object.entries(PEOPLE).find(([, p]) => p.name === l.speaker)?.[0] ?? "devon"),
        start: i * 22,
        text: l.text,
      })),
    };
    setMeetings((prev) => [meeting, ...prev]);
    setView({ kind: "meeting", id: meeting.id });
  }, []);

  const live = useLiveSession(handleLiveFinish);

  const openMeeting = (id: string) => setView({ kind: "meeting", id });
  const activeMeeting = view.kind === "meeting" ? meetings.find((m) => m.id === view.id) : undefined;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        meetings={meetings}
        view={view}
        onNavigate={setView}
        onOpenSearch={() => setPaletteOpen(true)}
        onRecord={live.start}
        recording={live.active}
        onStop={live.stop}
        dark={dark}
        onToggleDark={() => setDark(!dark)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {view.kind === "home" && (
          <HomeView
            meetings={meetings}
            onOpenMeeting={openMeeting}
            onRecord={live.start}
            onAsk={() => openMeeting(meetings[0].id)}
          />
        )}
        {view.kind === "meeting" && activeMeeting && (
          <NoteView meeting={activeMeeting} onToggleAction={() => {}} />
        )}
        {view.kind === "actions" && <ActionItemsView onOpenMeeting={openMeeting} />}
        {view.kind === "templates" && <TemplatesView />}
        {view.kind === "settings" && <SettingsView />}
      </main>

      {live.active && (
        <CaptureBar elapsed={live.elapsed} lines={live.lines} suggestions={live.suggestions} onStop={live.stop} />
      )}

      {paletteOpen && (
        <CommandPalette
          meetings={meetings}
          onClose={() => setPaletteOpen(false)}
          onOpenMeeting={openMeeting}
          onOpenActions={() => {
            setPaletteOpen(false);
            setView({ kind: "actions" });
          }}
        />
      )}
    </div>
  );
}

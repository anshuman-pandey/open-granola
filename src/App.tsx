import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, X } from "lucide-react";
import { CaptureBar } from "./components/CaptureBar";
import { CommandPalette } from "./components/CommandPalette";
import { HomeView } from "./components/HomeView";
import { NoteView } from "./components/NoteView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { ActionItemsView } from "./components/ActionItemsView";
import { CommitmentsView } from "./components/CommitmentsView";
import { TemplatesView } from "./components/TemplatesView";
import { ACTION_ITEMS, MEETINGS, PEOPLE } from "./lib/data";
import { getBackend } from "./lib/backend";
import { useLiveSession, type LiveLine } from "./hooks/useLiveSession";
import { useTauriSession } from "./hooks/useTauriSession";
import type { ActionItem, Brief, Meeting, View } from "./lib/types";

const backend = getBackend();
const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

function initialTheme() {
  try {
    const preference = localStorage.getItem("open-granola-theme");
    if (preference) return preference === "dark";
  } catch {
    /* Storage may be disabled by the host. */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function App() {
  const libraryGeneration = useRef(0);
  const [dark, setDark] = useState(initialTheme);
  const [view, setView] = useState<View>({ kind: "home" });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [meetings, setMeetings] = useState<Meeting[]>(
    backend.mode === "demo" ? MEETINGS : [],
  );
  const [actionItems, setActionItems] = useState<ActionItem[]>(
    backend.mode === "demo" ? ACTION_ITEMS : [],
  );
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(backend.mode === "tauri");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Meeting | null>(null);
  const [detailError, setDetailError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("open-granola-theme", dark ? "dark" : "light");
    } catch {
      /* Optional preference. */
    }
  }, [dark]);

  const refreshLibrary = useCallback(async () => {
    const generation = ++libraryGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const [library, actions] = await Promise.all([
        backend.listMeetings(),
        backend.listActionItems(),
      ]);
      if (generation !== libraryGeneration.current) return;
      setMeetings(library);
      setActionItems(actions);
      setDetail(null);
      setDetailVersion((version) => version + 1);
    } catch (cause) {
      if (generation === libraryGeneration.current)
        setError(`Could not load your library: ${messageOf(cause)}`);
      throw cause;
    } finally {
      if (generation === libraryGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const generation = ++libraryGeneration.current;
    if (backend.mode === "tauri") {
      Promise.all([backend.listMeetings(), backend.listActionItems()])
        .then(([library, actions]) => {
          if (!disposed && generation === libraryGeneration.current) {
            setMeetings(library);
            setActionItems(actions);
            setLoading(false);
          }
        })
        .catch((cause) => {
          if (!disposed && generation === libraryGeneration.current) {
            setError(`Could not load your library: ${messageOf(cause)}`);
            setLoading(false);
          }
        });
    }
    backend
      .getBrief()
      .then((value) => {
        if (!disposed && generation === libraryGeneration.current)
          setBrief(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (backend.mode !== "tauri") return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    backend
      .onLibraryChanged(() => {
        if (disposed) return;
        setMeetings([]);
        setActionItems([]);
        setDetail(null);
        setBrief(null);
        setView((previous) =>
          previous.kind === "meeting" ? { kind: "home" } : previous,
        );
        void refreshLibrary().catch(() => {});
      })
      .then((listener) => {
        if (disposed) listener();
        else unsubscribe = listener;
      })
      .catch(() => {
        if (!disposed)
          setError(
            "Library updates could not connect. Reload the app to refresh expired notes.",
          );
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [refreshLibrary]);

  const selectedId = view.kind === "meeting" ? view.id : null;
  useEffect(() => {
    if (!selectedId || backend.mode === "demo") return;
    let disposed = false;
    const generation = libraryGeneration.current;
    backend
      .getMeeting(selectedId)
      .then((result) => {
        if (disposed || generation !== libraryGeneration.current) return;
        setDetail(result.meeting);
        setDetailError(null);
        setActionItems((previous) => [
          ...previous.filter((item) => item.meetingId !== selectedId),
          ...result.actionItems,
        ]);
      })
      .catch((cause) => {
        if (!disposed && generation === libraryGeneration.current)
          setDetailError({ id: selectedId, message: messageOf(cause) });
      });
    return () => {
      disposed = true;
    };
  }, [selectedId, detailVersion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleDemoFinish = useCallback((lines: LiveLine[]) => {
    if (!lines.length) return;
    const names = [...new Set(lines.map((line) => line.speaker))];
    const participants = names.map(
      (name) =>
        Object.values(PEOPLE).find(
          (person) =>
            person.name === name || (name === "You" && person.id === "you"),
        ) ?? { id: name, name, initials: name.slice(0, 2), color: "#2E86AB" },
    );
    const meeting: Meeting = {
      id: `demo-${crypto.randomUUID()}`,
      title: "Sample recording — onboarding discussion",
      date: new Date().toISOString(),
      durationMin: 1,
      participants,
      tags: ["demo"],
      template: "Meeting notes",
      summary:
        "This is a sample transcript from the browser demo. The desktop app uses your microphone and local models.",
      chapters: [],
      decisions: [],
      transcript: lines.map((line, index) => ({
        id: line.id,
        speakerId:
          participants.find((person) => person.name === line.speaker)?.id ??
          "you",
        start: Math.round((line.startMs ?? index * 3000) / 1000),
        text: line.text,
      })),
    };
    setMeetings((previous) => [meeting, ...previous]);
    setView({ kind: "meeting", id: meeting.id });
  }, []);

  const handleTauriFinish = useCallback(
    async (id: string) => {
      // A saved note remains durable even if refreshing the list subsequently fails.
      await refreshLibrary().catch(() => {});
      setView({ kind: "meeting", id });
    },
    [refreshLibrary],
  );

  const demo = useLiveSession(handleDemoFinish);
  const tauri = useTauriSession(handleTauriFinish);
  const live = backend.mode === "demo" ? demo : tauri;
  const busy = backend.mode === "tauri" && (tauri.busy || tauri.canRetry);
  const visibleError = error ?? (backend.mode === "tauri" ? tauri.error : null);
  const openMeeting = (id: string) => setView({ kind: "meeting", id });
  const activeMeeting = selectedId
    ? backend.mode === "demo"
      ? meetings.find((meeting) => meeting.id === selectedId)
      : detail?.id === selectedId
        ? detail
        : undefined
    : undefined;
  const toggleAction = async (id: string, done: boolean) => {
    await backend.toggleAction(id, done);
    setActionItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, done } : item)),
    );
  };
  const libraryChanged = () => {
    setMeetings([]);
    setActionItems([]);
    setDetail(null);
    setBrief(null);
    void refreshLibrary().catch(() => {});
  };

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-card focus:p-3"
      >
        Skip to workspace
      </a>
      <Sidebar
        meetings={meetings}
        view={view}
        onNavigate={setView}
        onOpenSearch={() => setPaletteOpen(true)}
        onRecord={live.start}
        recording={live.active}
        onStop={live.stop}
        busy={busy}
        dark={dark}
        onToggleDark={() => setDark((previous) => !previous)}
      />
      <main
        data-capturing={live.active}
        id="workspace"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col outline-none"
      >
        {backend.mode === "demo" && (
          <div className="border-b border-border bg-accent/50 px-5 py-2 text-center text-xs text-muted-foreground">
            <strong className="text-foreground">Interactive demo</strong> ·
            Sample meetings · Recording is simulated · Changes last for this
            session
          </div>
        )}
        {visibleError && (
          <div
            role="alert"
            className="flex items-center gap-3 border-b border-destructive/20 bg-destructive/10 px-5 py-3 text-sm"
          >
            <AlertCircle size={18} className="shrink-0" />
            <span className="flex-1">{visibleError}</span>
            {error && (
              <button
                className="underline"
                onClick={() => void refreshLibrary().catch(() => {})}
              >
                Retry
              </button>
            )}
            <button
              aria-label="Dismiss error"
              onClick={() => {
                setError(null);
                tauri.clearError();
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {backend.mode === "tauri" && tauri.canRetry && (
          <div
            role="alert"
            className="border-b border-border bg-amber-500/10 px-5 py-3 text-sm"
          >
            <p>
              Your recording is still in memory. Keep this window open and retry
              saving before starting another meeting.
            </p>
            <div className="mt-2 flex gap-4">
              <button
                className="font-semibold underline"
                onClick={() => void tauri.stop()}
              >
                Retry saving
              </button>
              <button
                className="text-muted-foreground underline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard this unsaved recording? This cannot be undone.",
                    )
                  )
                    void tauri.discard();
                }}
              >
                Discard unsaved recording
              </button>
            </div>
          </div>
        )}
        {backend.mode === "tauri" && tauri.busy && (
          <div
            role="status"
            className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm"
          >
            <LoaderCircle size={16} className="animate-spin" />
            {tauri.phase === "saving"
              ? "Finishing transcription and saving your note…"
              : "Preparing microphone and local transcription…"}
          </div>
        )}
        {loading && (
          <div
            role="status"
            className="px-5 py-2 text-xs text-muted-foreground"
          >
            Loading your library…
          </div>
        )}
        {view.kind === "home" && (
          <HomeView
            meetings={meetings}
            brief={brief}
            onOpenMeeting={openMeeting}
            onRecord={live.start}
            onAsk={() => setPaletteOpen(true)}
            onSearch={() => setPaletteOpen(true)}
            busy={busy || loading}
            recording={live.active}
          />
        )}
        {view.kind === "meeting" && activeMeeting && (
          <NoteView
            key={activeMeeting.id}
            meeting={activeMeeting}
            actionItems={actionItems.filter(
              (item) => item.meetingId === activeMeeting.id,
            )}
            onToggleAction={toggleAction}
            askFn={
              backend.mode === "tauri"
                ? (question) => backend.ask(question, activeMeeting.id)
                : undefined
            }
          />
        )}
        {view.kind === "meeting" && !activeMeeting && (
          <div className="m-auto max-w-md p-8 text-center" role="status">
            {detailError?.id === view.id ? (
              <>
                <h1 className="text-xl font-semibold">
                  Could not open this meeting
                </h1>
                <p className="my-3 text-sm text-muted-foreground">
                  {detailError.message}
                </p>
                <button
                  className="rounded-lg border px-4 py-2"
                  onClick={() => setDetailVersion((version) => version + 1)}
                >
                  Try again
                </button>
              </>
            ) : (
              "Opening meeting…"
            )}
          </div>
        )}
        {view.kind === "actions" && (
          <ActionItemsView
            items={actionItems}
            onOpenMeeting={openMeeting}
            onToggle={toggleAction}
          />
        )}
        {view.kind === "commitments" && (
          <CommitmentsView onOpenMeeting={openMeeting} />
        )}
        {view.kind === "templates" && <TemplatesView />}
        {view.kind === "settings" && (
          <SettingsView onLibraryChange={libraryChanged} />
        )}
      </main>
      {live.active && (
        <CaptureBar
          elapsed={live.elapsed}
          lines={live.lines}
          suggestions={live.suggestions}
          onStop={live.stop}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          meetings={meetings}
          actionItems={actionItems}
          onClose={() => setPaletteOpen(false)}
          onOpenMeeting={openMeeting}
          searchFn={
            backend.mode === "tauri"
              ? (query) => backend.search(query)
              : undefined
          }
          onOpenActions={() => {
            setPaletteOpen(false);
            setView({ kind: "actions" });
          }}
        />
      )}
    </div>
  );
}

/**
 * Backend abstraction — one interface, two implementations.
 *
 *  - TauriBackend: real desktop app. Every call crosses IPC into the Rust core
 *    (see src-tauri/src/commands.rs). Used when running inside Tauri.
 *  - DemoBackend: the in-browser demo (landing previews, development). Serves
 *    the bundled sample library so the UI is fully explorable without Rust.
 *
 * The UI never branches on mode directly except where the demo needs to
 * simulate latency/streaming; everything else goes through this layer.
 */
import type { ActionItem, Brief, Commitment, Meeting, Person } from "./types";
import { ACTION_ITEMS, BRIEF, COMMITMENTS, MEETINGS } from "./data";
import { DEMO_PROVIDER_STATUS } from "./provider-types";
import { DEFAULT_LANGUAGE_SETTINGS, type LanguageSettings } from "./language-settings";
import type {
  ChatgptAuthStatus,
  ChatgptModel,
  ProviderConfig,
  ProviderStatus,
  ProviderTestResult,
  SaveProviderSettings,
} from "./provider-types";

export interface SearchHit {
  id: string;
  title: string;
  sub: string;
  ref: string;
  kind: "meeting" | "action";
}

export interface LiveSegment {
  start_ms: number;
  end_ms: number;
  speaker: number;
  text: string;
  final_: boolean;
}

export interface Backend {
  mode: "demo" | "tauri";
  listMeetings(): Promise<Meeting[]>;
  listActionItems(): Promise<ActionItem[]>;
  onLibraryChanged(cb: () => void): Promise<() => void>;
  getMeeting(
    id: string,
  ): Promise<{ meeting: Meeting; actionItems: ActionItem[] }>;
  ask(question: string, meetingId?: string): Promise<string>;
  search(query: string): Promise<SearchHit[]>;
  toggleAction(id: string, done: boolean): Promise<void>;
  startCapture(meetingHint?: string): Promise<void>;
  stopCapture(segments: LiveSegment[], template: string): Promise<string>;
  cancelCapture(): Promise<void>;
  onCaptureError(cb: (message: string) => void): Promise<() => void>;
  onSegment(cb: (seg: LiveSegment) => void): Promise<() => void>;
  getBrief(): Promise<Brief | null>;
  listCommitments(): Promise<Commitment[]>;
  markCommitment(id: string, status: "open" | "kept"): Promise<void>;
  runRecipe(prompt: string, meetingId?: string): Promise<string>;
  importGranola(json: string): Promise<number>;
  modelStatus(): Promise<Record<string, unknown>>;
  getProviderSettings(): Promise<ProviderStatus>;
  getLanguageSettings(): Promise<LanguageSettings>;
  saveLanguageSettings(settings: LanguageSettings): Promise<LanguageSettings>;
  saveProviderSettings(settings: SaveProviderSettings): Promise<ProviderStatus>;
  testProviderConnection(): Promise<ProviderTestResult>;
  chatgptAuthStatus(): Promise<ChatgptAuthStatus>;
  chatgptModels(): Promise<ChatgptModel[]>;
  startChatgptSignIn(options: { allowRemote: boolean; accountId?: string | null }): Promise<void>;
  cancelChatgptSignIn(): Promise<void>;
  disconnectChatgpt(): Promise<void>;
  summarizeMeeting(meetingId: string, expectedConfig: ProviderConfig): Promise<void>;
  setRetention(days: number): Promise<void>;
  purgeAll(): Promise<void>;
}

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/* ------------------------------------------------------------------ */
/* Demo                                                                */
/* ------------------------------------------------------------------ */

const demoBackend: Backend = {
  mode: "demo",
  listMeetings: async () => structuredClone(MEETINGS),
  listActionItems: async () => structuredClone(ACTION_ITEMS),
  onLibraryChanged: async () => () => {},
  getMeeting: async (id) => ({
    meeting: MEETINGS.find((m) => m.id === id) ?? MEETINGS[0],
    actionItems: ACTION_ITEMS.filter((a) => a.meetingId === id),
  }),
  ask: async () => {
    throw new Error("demo-ask"); // NoteView falls back to its canned librarian
  },
  search: async () => [],
  toggleAction: async () => {},
  startCapture: async () => {},
  stopCapture: async () => "",
  cancelCapture: async () => {},
  onCaptureError: async () => () => {},
  onSegment: async () => () => {},
  getBrief: async () => BRIEF,
  listCommitments: async () => COMMITMENTS,
  markCommitment: async () => {},
  runRecipe: async () =>
    "Demo mode: recipes run against the on-device model in the desktop app. Copy the prompt and it will execute locally over your real library.",
  importGranola: async () => 0,
  modelStatus: async () => ({
    whisper: false,
    llm: false,
    embed: false,
    demo: true,
  }),
  getProviderSettings: async () => structuredClone(DEMO_PROVIDER_STATUS),
  getLanguageSettings: async () => ({ ...DEFAULT_LANGUAGE_SETTINGS }),
  saveLanguageSettings: async () => {
    throw new Error("Save transcription and summary languages in the desktop app. This browser preview uses sample content.");
  },
  saveProviderSettings: async () => {
    throw new Error("Connect models in the desktop app. This browser preview does not save credentials.");
  },
  testProviderConnection: async () => {
    throw new Error("Connection checks require the desktop app.");
  },
  chatgptAuthStatus: async () => ({
    state: "signed_out",
    detail: "Sign in from the desktop app.",
    credential_storage: "none",
    accounts: [],
    active_account_id: null,
  }),
  startChatgptSignIn: async () => {
    throw new Error("Sign in from the desktop app.");
  },
  chatgptModels: async () => {
    throw new Error("Load account models in the desktop app.");
  },
  cancelChatgptSignIn: async () => {
    throw new Error("Sign in from the desktop app.");
  },
  disconnectChatgpt: async () => {
    throw new Error("Manage your connection in the desktop app.");
  },
  summarizeMeeting: async () => {
    throw new Error("Generate summaries in the desktop app.");
  },
  setRetention: async () => {},
  purgeAll: async () => {},
};

/* ------------------------------------------------------------------ */
/* Tauri                                                               */
/* ------------------------------------------------------------------ */

const PALETTE = ["#2E86AB", "#3D9B6C", "#C25E8A", "#B07A2A", "#7C5CBF"];

function speakerPerson(speaker: number): Person {
  if (speaker === 0)
    return { id: "sp-0", name: "Speaker 0", initials: "S0", color: "#E4572E" };
  const c = PALETTE[Math.abs(speaker - 1) % PALETTE.length];
  return {
    id: `sp-${speaker}`,
    name: `Speaker ${speaker}`,
    initials: `S${speaker}`,
    color: c,
  };
}

interface RemoteMeetingRow {
  id: string;
  title: string;
  started_at: string;
  duration_s: number;
  summary: string | null;
  starred: number;
  chapters: string | null;
  decisions: string | null;
  template: string | null;
}

interface RemoteGetMeeting {
  id: string;
  processing_history?: Meeting["processingHistory"];
  meeting: {
    title: string;
    started_at: string;
    duration_s: number;
    summary: string | null;
    chapters: string | null;
    decisions: string | null;
    template: string | null;
    starred: number;
  };
  segments: {
    id: string;
    start_ms: number;
    end_ms: number;
    speaker: number;
    text: string;
  }[];
  action_items: {
    id: string;
    text: string;
    owner: string | null;
    due: string | null;
    done: number;
  }[];
}

export function adaptMeeting(
  id: string,
  m: RemoteGetMeeting["meeting"],
  segs: RemoteGetMeeting["segments"],
): Meeting {
  const speakers = [...new Set(segs.map((s) => s.speaker))].sort(
    (a, b) => a - b,
  );
  const participants = speakers.map(speakerPerson);
  let chapters: Meeting["chapters"] = [];
  let decisions: string[] = [];
  try {
    const parsedChapters: unknown = m.chapters ? JSON.parse(m.chapters) : [];
    if (Array.isArray(parsedChapters)) {
      chapters = parsedChapters.filter(
        (chapter): chapter is Meeting["chapters"][number] =>
          chapter !== null &&
          typeof chapter === "object" &&
          typeof chapter.title === "string" &&
          typeof chapter.body === "string" &&
          typeof chapter.timestamp === "string",
      );
    }
  } catch {
    /* A damaged legacy field must not hide the transcript. */
  }
  try {
    const parsedDecisions: unknown = m.decisions ? JSON.parse(m.decisions) : [];
    if (Array.isArray(parsedDecisions))
      decisions = parsedDecisions.filter(
        (value): value is string => typeof value === "string",
      );
  } catch {
    /* tolerate legacy rows */
  }
  return {
    id,
    title: m.title,
    date: normalizeDatabaseDate(m.started_at),
    durationMin: Math.max(1, Math.round(m.duration_s / 60)),
    participants,
    summary: m.summary ?? "",
    chapters,
    decisions,
    transcript: segs.map((s) => ({
      id: s.id,
      speakerId: `sp-${s.speaker}`,
      start: Math.round(s.start_ms / 1000),
      text: s.text,
    })),
    tags: [],
    template: m.template ?? "Meeting",
    starred: m.starred === 1,
  };
}

export function normalizeDatabaseDate(value: string): string {
  // SQLite datetime('now') is UTC, even though its serialized value has no zone.
  const normalized = value.replace(" ", "T");
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)
    ? `${normalized}Z`
    : normalized;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const tauriBackend: Backend = {
  mode: "tauri",

  async listMeetings() {
    const rows = await tauriInvoke<RemoteMeetingRow[]>("list_meetings");
    return rows.map((row) => adaptMeeting(row.id, row, []));
  },

  async onLibraryChanged(callback) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen("library-changed", callback);
  },

  async listActionItems() {
    const rows = await tauriInvoke<
      {
        id: string;
        text: string;
        owner: string | null;
        due: string | null;
        done: number;
        meeting_id: string;
        meeting_title: string;
      }[]
    >("list_action_items");
    return rows.map((row) => ({
      id: row.id,
      text: row.text,
      owner: row.owner ?? "Unassigned",
      due: row.due ?? undefined,
      done: row.done === 1,
      meetingId: row.meeting_id,
      meetingTitle: row.meeting_title,
    }));
  },

  async getMeeting(id) {
    const raw = await tauriInvoke<RemoteGetMeeting>("get_meeting", { id });
    const meeting = adaptMeeting(raw.id, raw.meeting, raw.segments);
    meeting.processingHistory = raw.processing_history ?? [];
    const actionItems: ActionItem[] = raw.action_items.map((a) => ({
      id: a.id,
      text: a.text,
      owner: a.owner ?? "Unassigned",
      due: a.due ?? undefined,
      done: a.done === 1,
      meetingId: id,
      meetingTitle: meeting.title,
    }));
    return { meeting, actionItems };
  },

  ask: (question, meetingId) =>
    tauriInvoke<string>("ask_library", {
      question,
      meetingId: meetingId ?? null,
    }),

  async search(query) {
    const rows = await tauriInvoke<
      { id: string; title: string; started_at: string }[]
    >("semantic_search", { query });
    return rows.map((r) => ({
      id: `m-${r.id}`,
      kind: "meeting" as const,
      title: r.title,
      sub: r.started_at,
      ref: r.id,
    }));
  },

  toggleAction: (id, done) => tauriInvoke("toggle_action_item", { id, done }),

  startCapture: (meetingHint) =>
    tauriInvoke("start_capture", { meetingHint: meetingHint ?? null }),

  stopCapture: (segments, template) =>
    tauriInvoke<string>("stop_capture_and_enhance", {
      transcript: segments,
      templateMd: template,
    }),

  cancelCapture: () => tauriInvoke("cancel_capture"),

  async onCaptureError(cb) {
    const { listen } = await import("@tauri-apps/api/event");
    const errorListener = await listen<string>("capture-error", (event) =>
      cb(event.payload),
    );
    try {
      const warningListener = await listen<string>("capture-warning", (event) =>
        cb(event.payload),
      );
      return () => {
        errorListener();
        warningListener();
      };
    } catch (error) {
      errorListener();
      throw error;
    }
  },

  async onSegment(cb) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<LiveSegment>("segment", (e) => cb(e.payload));
  },

  async getBrief() {
    const raw = await tauriInvoke<
      | { empty: true }
      | {
          meeting: { title: string; starts_at: string; participants: string[] };
          brief: {
            recap: string;
            open_commitments: {
              owner: string;
              text: string;
              due: string | null;
              overdue: boolean | null;
            }[];
            worth_raising: string[];
          };
        }
    >("get_brief");
    if ("empty" in raw) return null;
    const startsIn = "soon"; // precise countdown computed by the UI from starts_at
    return {
      meetingTitle: raw.meeting.title,
      startsIn,
      participants: raw.meeting.participants.map((p, i) => ({
        id: `p-${i}`,
        name: p,
        initials: p
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        color: PALETTE[i % PALETTE.length],
      })),
      lastTime: {
        title: raw.meeting.title,
        date: raw.meeting.starts_at,
        recap: raw.brief.recap,
      },
      openCommitments: raw.brief.open_commitments.map((c) => ({
        owner: c.owner,
        text: c.text,
        due: c.due ?? undefined,
        overdue: c.overdue ?? false,
      })),
      worthRaising: raw.brief.worth_raising,
    };
  },

  async listCommitments() {
    const rows = await tauriInvoke<
      {
        id: string;
        text: string;
        owner: string | null;
        due: string | null;
        status: string;
        made_on: string;
        meeting_title: string;
        meeting_id: string;
      }[]
    >("list_commitments");
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      owner: r.owner ?? "Someone",
      madeIn: r.meeting_title,
      meetingId: r.meeting_id,
      madeOn: r.made_on,
      due: r.due ?? undefined,
      status: (r.status === "kept"
        ? "kept"
        : r.status === "overdue"
          ? "overdue"
          : "open") as Commitment["status"],
      ageDays: Math.max(
        0,
        Math.round((Date.now() - +new Date(r.made_on)) / 86400000),
      ),
    }));
  },

  markCommitment: (id, status) =>
    tauriInvoke("mark_commitment", { id, status }),

  runRecipe: (prompt, meetingId) =>
    tauriInvoke("run_recipe", { prompt, meetingId: meetingId ?? null }),

  importGranola: (json) =>
    tauriInvoke<number>("import_granola_export", { json }),

  modelStatus: () => tauriInvoke("model_status"),

  getProviderSettings: () => tauriInvoke("get_provider_settings"),
  getLanguageSettings: () => tauriInvoke("get_language_settings"),
  saveLanguageSettings: (settings) => tauriInvoke("save_language_settings", { settings }),

  saveProviderSettings: ({ config, apiKey, clearApiKey }) =>
    tauriInvoke("save_provider_settings", {
      config,
      apiKey: apiKey ?? null,
      clearApiKey: clearApiKey ?? false,
    }),

  testProviderConnection: () => tauriInvoke("test_provider_connection"),

  chatgptAuthStatus: () => tauriInvoke("get_chatgpt_auth_status"),
  chatgptModels: () => tauriInvoke("list_chatgpt_models"),
  startChatgptSignIn: ({ allowRemote, accountId }) => tauriInvoke("start_chatgpt_sign_in", { allowRemote, accountId: accountId ?? null }),
  cancelChatgptSignIn: () => tauriInvoke("cancel_chatgpt_sign_in"),
  disconnectChatgpt: () => tauriInvoke("disconnect_chatgpt"),
  summarizeMeeting: (meetingId, expectedConfig) => tauriInvoke("regenerate_summary", { meetingId, expectedConfig }),

  setRetention: (days) => tauriInvoke("set_retention_policy", { days }),

  purgeAll: () => tauriInvoke("purge_everything"),
};

/* ------------------------------------------------------------------ */

let cached: Backend | null = null;
export function getBackend(): Backend {
  if (!cached) cached = isTauri() ? tauriBackend : demoBackend;
  return cached;
}

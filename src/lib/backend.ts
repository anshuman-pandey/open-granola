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
  getMeeting(id: string): Promise<{ meeting: Meeting; actionItems: ActionItem[] }>;
  ask(question: string, meetingId?: string): Promise<string>;
  search(query: string): Promise<SearchHit[]>;
  toggleAction(id: string, done: boolean): Promise<void>;
  startCapture(meetingHint?: string): Promise<void>;
  stopCapture(segments: LiveSegment[], template: string): Promise<string>;
  onSegment(cb: (seg: LiveSegment) => void): Promise<() => void>;
  getBrief(): Promise<Brief | null>;
  listCommitments(): Promise<Commitment[]>;
  markCommitment(id: string, status: "open" | "kept"): Promise<void>;
  runRecipe(prompt: string, meetingId?: string): Promise<string>;
  importGranola(json: string): Promise<number>;
  modelStatus(): Promise<Record<string, unknown>>;
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
  listMeetings: async () => MEETINGS,
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
  onSegment: async () => () => {},
  getBrief: async () => BRIEF,
  listCommitments: async () => COMMITMENTS,
  markCommitment: async () => {},
  runRecipe: async () =>
    "Demo mode: recipes run against the on-device model in the desktop app. Copy the prompt and it will execute locally over your real library.",
  importGranola: async () => 0,
  modelStatus: async () => ({ whisper: true, llm: true, embed: true, bytes_sent_lifetime: 0 }),
  setRetention: async () => {},
  purgeAll: async () => {},
};

/* ------------------------------------------------------------------ */
/* Tauri                                                               */
/* ------------------------------------------------------------------ */

const PALETTE = ["#2E86AB", "#3D9B6C", "#C25E8A", "#B07A2A", "#7C5CBF"];

function speakerPerson(speaker: number): Person {
  if (speaker === 0) return { id: "you", name: "You", initials: "YO", color: "#E4572E" };
  const c = PALETTE[(speaker - 1) % PALETTE.length];
  return { id: `sp-${speaker}`, name: `Speaker ${speaker}`, initials: `S${speaker}`, color: c };
}

interface RemoteMeetingRow {
  id: string;
  title: string;
  started_at: string;
  duration_s: number;
  summary: string | null;
  starred: number;
}

interface RemoteGetMeeting {
  id: string;
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
  segments: { id: string; start_ms: number; end_ms: number; speaker: number; text: string }[];
  action_items: { id: string; text: string; owner: string | null; due: string | null; done: number }[];
}

function adaptMeeting(id: string, m: RemoteGetMeeting["meeting"], segs: RemoteGetMeeting["segments"]): Meeting {
  const speakers = [...new Set(segs.map((s) => s.speaker))].sort();
  const participants = speakers.length > 0 ? speakers.map(speakerPerson) : [speakerPerson(0)];
  let chapters: Meeting["chapters"] = [];
  let decisions: string[] = [];
  try {
    chapters = m.chapters ? JSON.parse(m.chapters) : [];
    decisions = m.decisions ? JSON.parse(m.decisions) : [];
  } catch {
    /* tolerate legacy rows */
  }
  return {
    id,
    title: m.title,
    date: m.started_at.replace(" ", "T"),
    durationMin: Math.max(1, Math.round(m.duration_s / 60)),
    participants,
    summary: m.summary ?? "",
    chapters,
    decisions,
    transcript: segs.map((s) => ({
      id: s.id,
      speakerId: s.speaker === 0 ? "you" : `sp-${s.speaker}`,
      start: Math.round(s.start_ms / 1000),
      text: s.text,
    })),
    tags: [],
    template: m.template ?? "Meeting",
    starred: m.starred === 1,
  };
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const tauriBackend: Backend = {
  mode: "tauri",

  async listMeetings() {
    const rows = await tauriInvoke<RemoteMeetingRow[]>("list_meetings");
    // Small-library pragmatism: hydrate each row. TODO: batch endpoint once
    // libraries routinely exceed a few hundred meetings.
    const out: Meeting[] = [];
    for (const r of rows) {
      const full = await this.getMeeting(r.id);
      out.push(full.meeting);
    }
    return out;
  },

  async getMeeting(id) {
    const raw = await tauriInvoke<RemoteGetMeeting>("get_meeting", { id });
    const meeting = adaptMeeting(raw.id, raw.meeting, raw.segments);
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

  ask: (question) => tauriInvoke<string>("ask_library", { question }),

  async search(query) {
    const rows = await tauriInvoke<{ id: string; title: string; started_at: string }[]>(
      "semantic_search",
      { query },
    );
    return rows.map((r) => ({
      id: `m-${r.id}`,
      kind: "meeting" as const,
      title: r.title,
      sub: r.started_at,
      ref: r.id,
    }));
  },

  toggleAction: (id, done) => tauriInvoke("toggle_action_item", { id, done }),

  startCapture: (meetingHint) => tauriInvoke("start_capture", { meetingHint: meetingHint ?? null }),

  stopCapture: (segments, template) =>
    tauriInvoke<string>("stop_capture_and_enhance", { transcript: segments, templateMd: template }),

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
            open_commitments: { owner: string; text: string; due: string | null; overdue: boolean | null }[];
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
        initials: p.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        color: PALETTE[i % PALETTE.length],
      })),
      lastTime: { title: raw.meeting.title, date: raw.meeting.starts_at, recap: raw.brief.recap },
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
        id: string; text: string; owner: string | null; due: string | null;
        status: string; made_on: string; meeting_title: string; meeting_id: string;
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
      status: (r.status === "kept" ? "kept" : r.status === "overdue" ? "overdue" : "open") as Commitment["status"],
      ageDays: Math.max(0, Math.round((Date.now() - +new Date(r.made_on)) / 86400000)),
    }));
  },

  markCommitment: (id, status) => tauriInvoke("mark_commitment", { id, status }),

  runRecipe: (prompt, meetingId) => tauriInvoke("run_recipe", { prompt, meetingId: meetingId ?? null }),

  importGranola: (json) => tauriInvoke<number>("import_granola_export", { json }),

  modelStatus: () => tauriInvoke("model_status"),

  setRetention: (days) => tauriInvoke("set_retention_policy", { days }),

  purgeAll: () => tauriInvoke("purge_everything"),
};

/* ------------------------------------------------------------------ */

let cached: Backend | null = null;
export function getBackend(): Backend {
  if (!cached) cached = isTauri() ? tauriBackend : demoBackend;
  return cached;
}

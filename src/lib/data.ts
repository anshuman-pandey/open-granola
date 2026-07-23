import type { Brief, Commitment, Meeting, Person, Recipe, Template } from "./types";

export const PEOPLE: Record<string, Person> = {
  you: { id: "you", name: "You", initials: "YO", color: "#E4572E" },
  amara: { id: "amara", name: "Amara Osei", initials: "AO", color: "#7C5CBF", role: "Design Lead" },
  devon: { id: "devon", name: "Devon Park", initials: "DP", color: "#2E86AB", role: "Eng Manager" },
  lin: { id: "lin", name: "Lin Zhao", initials: "LZ", color: "#3D9B6C", role: "PM" },
  priya: { id: "priya", name: "Priya Nair", initials: "PN", color: "#C25E8A", role: "Data" },
  marcus: { id: "marcus", name: "Marcus Hale", initials: "MH", color: "#B07A2A", role: "Founder" },
};

export const MEETINGS: Meeting[] = [
  {
    id: "m-aurora-q3",
    title: "Aurora — Q3 launch plan",
    date: "2026-07-17T14:00:00",
    durationMin: 42,
    participants: [PEOPLE.you, PEOPLE.amara, PEOPLE.devon, PEOPLE.lin],
    tags: ["launch", "aurora"],
    template: "Product sync",
    starred: true,
    summary:
      "The team aligned on a phased Aurora launch starting with the design-system migration on Aug 4. Devon flagged the token pipeline as the critical path and committed to a perf budget review by Jul 24. Lin will circulate the updated rollout brief; Amara owns the motion spec sign-off.",
    chapters: [
      {
        title: "Launch sequencing",
        timestamp: "02:14",
        body: "Agreed to split the launch into three phases: tokens, components, docs. Phase one starts Aug 4 and gates the rest. Marketing moves to phase two.",
      },
      {
        title: "Performance budget",
        timestamp: "14:40",
        body: "Devon raised bundle-size regression risk. Set a hard budget of 92 kB gzipped for the shell; CI fails above it. Priya to backfill the analytics baseline first.",
      },
      {
        title: "Motion spec",
        timestamp: "27:05",
        body: "Amara walked through the spring-curve system. Team preferred the 240 ms default over 180 ms. Sign-off needed from Devon on reduced-motion fallbacks.",
      },
      {
        title: "Risks & owners",
        timestamp: "36:52",
        body: "Two open risks: the Figma-to-token sync flakiness (owner: Amara) and staggered rollout comms (owner: Lin). Next checkpoint Jul 24, async in #aurora.",
      },
    ],
    decisions: [
      "Launch Aurora in three phases starting Aug 4, tokens first",
      "Hard 92 kB gzipped bundle budget enforced in CI",
      "Default motion duration set to 240 ms with reduced-motion fallbacks",
    ],
    transcript: [
      { id: "t1", speakerId: "lin", start: 0, text: "Okay, recording's on. Let's do the launch plan top to bottom. Amara, want to start with sequencing?" },
      { id: "t2", speakerId: "amara", start: 9, text: "Sure. My strong preference is three phases — tokens, then components, then docs. Tokens first because everything downstream depends on the pipeline being stable." },
      { id: "t3", speakerId: "you", start: 24, text: "What date are we anchoring to for phase one?" },
      { id: "t4", speakerId: "amara", start: 27, text: "August fourth. That gives us two full weeks to harden the Figma sync, which is still flaky about one run in twenty." },
      { id: "t5", speakerId: "devon", start: 41, text: "That flakiness worries me less than bundle size, honestly. We're creeping up — the shell is at 86 kB gzipped and phase two adds the whole component set." },
      { id: "t6", speakerId: "you", start: 55, text: "Can we set a hard budget and enforce it in CI? Ninety-two kilobytes feels like the right line." },
      { id: "t7", speakerId: "devon", start: 62, text: "Works for me. I'll wire the check into the pipeline this week. Priya, I'd want the analytics baseline backfilled before we flip enforcement on." },
      { id: "t8", speakerId: "lin", start: 78, text: "Noted. On comms — I'll redraft the rollout brief to reflect the three phases and get it to everyone by Thursday." },
      { id: "t9", speakerId: "amara", start: 92, text: "One more thing: motion. I'm proposing a spring system, 240 milliseconds as the default duration. I tested 180 and it feels twitchy on larger panels." },
      { id: "t10", speakerId: "devon", start: 108, text: "240 is fine as long as we ship the reduced-motion fallbacks. Non-negotiable for accessibility sign-off." },
      { id: "t11", speakerId: "amara", start: 118, text: "Agreed, they're already specced. I'll send the motion doc for sign-off today." },
      { id: "t12", speakerId: "lin", start: 126, text: "Great. Two risks then: Figma sync flakiness — Amara. Staggered rollout comms — me. Checkpoint July twenty-fourth, async in the Aurora channel." },
    ],
  },
  {
    id: "m-nimbus-review",
    title: "Nimbus pricing review w/ Marcus",
    date: "2026-07-16T10:30:00",
    durationMin: 28,
    participants: [PEOPLE.you, PEOPLE.marcus, PEOPLE.priya],
    tags: ["pricing", "nimbus"],
    template: "1:1",
    summary:
      "Marcus pushed for a usage-based tier for Nimbus instead of raising seat prices. Priya's cohort data shows expansion revenue is strongest past 40 seats, so the overage model targets that band. Decision deferred until the churn analysis lands Jul 21.",
    chapters: [
      {
        title: "Seat price vs usage",
        timestamp: "03:30",
        body: "Marcus is firmly against a seat-price increase before the renewal season. Usage-based overages test better with the mid-market segment.",
      },
      {
        title: "Cohort data",
        timestamp: "11:12",
        body: "Priya: accounts past 40 seats show 2.3× expansion revenue. The 20–40 band is flat. Overage pricing should kick in above 40 seats.",
      },
      {
        title: "Open questions",
        timestamp: "21:45",
        body: "Need churn sensitivity analysis before committing. Also: grandfathering policy for annual contracts signed before September.",
      },
    ],
    decisions: [
      "No seat-price increase this cycle",
      "Usage-based overage tier scoped to the 40+ seat band, pending churn analysis",
    ],
    transcript: [
      { id: "t1", speakerId: "marcus", start: 0, text: "I'll be direct: I don't want a seat-price increase landing right before renewal season. Find me another lever." },
      { id: "t2", speakerId: "priya", start: 11, text: "The data supports usage-based. Expansion revenue past forty seats is two-point-three times the baseline — that band barely blinks at overages." },
      { id: "t3", speakerId: "you", start: 26, text: "And the twenty-to-forty band?" },
      { id: "t4", speakerId: "priya", start: 29, text: "Flat. Which is actually good news — we can scope the overage tier above forty seats and leave the sensitive middle alone." },
      { id: "t5", speakerId: "marcus", start: 44, text: "Fine, but I'm not signing anything until I see churn sensitivity. If we lose two anchor accounts the math falls apart." },
      { id: "t6", speakerId: "priya", start: 58, text: "I'll have the churn model by the twenty-first. Including grandfathering scenarios for annual contracts signed before September." },
    ],
  },
  {
    id: "m-standup",
    title: "Eng standup — offline sync deep-dive",
    date: "2026-07-15T09:15:00",
    durationMin: 19,
    participants: [PEOPLE.you, PEOPLE.devon, PEOPLE.priya],
    tags: ["eng", "sync"],
    template: "Standup",
    summary:
      "Standup turned into a deep-dive on the offline sync conflict resolver. Devon demoed the CRDT merge; the remaining bug is tombstone cleanup on large notebooks. Priya volunteered a synthetic data generator to reproduce it.",
    chapters: [
      { title: "CRDT merge demo", timestamp: "04:02", body: "Devon demoed the new merge path. Conflicts on list items now resolve without user prompts in the common cases." },
      { title: "Tombstone bug", timestamp: "09:47", body: "Large notebooks (5k+ blocks) show unbounded tombstone growth. Compaction pass runs but doesn't reclaim. Root cause unknown." },
      { title: "Repro plan", timestamp: "14:20", body: "Priya will build a synthetic generator that produces pathological edit histories. Target: deterministic repro by end of week." },
    ],
    decisions: ["Ship CRDT merge behind a flag this sprint", "Tombstone compaction blocks the sync GA"],
    transcript: [
      { id: "t1", speakerId: "devon", start: 0, text: "Quick one today, mostly I want to show the CRDT merge. Screen's up — conflicts on list items now resolve silently in the common cases." },
      { id: "t2", speakerId: "you", start: 12, text: "This is much better. What's the remaining sharp edge?" },
      { id: "t3", speakerId: "devon", start: 16, text: "Tombstones. On big notebooks — five thousand blocks and up — the compaction pass runs but doesn't actually reclaim anything. I don't know why yet." },
      { id: "t4", speakerId: "priya", start: 30, text: "Do we have a deterministic repro? If not, I'll write a generator for pathological edit histories. That's usually the fastest way to corner these." },
      { id: "t5", speakerId: "devon", start: 42, text: "We don't, and yes please. End of week for the generator?" },
      { id: "t6", speakerId: "priya", start: 47, text: "Deal. I'll timebox it to two days." },
    ],
  },
  {
    id: "m-client-vesper",
    title: "Vesper Health — discovery call",
    date: "2026-07-11T16:00:00",
    durationMin: 51,
    participants: [PEOPLE.you, PEOPLE.lin],
    tags: ["sales", "discovery"],
    template: "Sales discovery",
    summary:
      "Vesper's compliance team rejected every cloud notetaker they've evaluated — data residency is the blocker. Their ideal pilot: 40 clinicians, on-device processing, audit export to their SIEM. Budget exists this quarter. Lin is sending the security whitepaper; follow-up scheduled Jul 22.",
    chapters: [
      { title: "The compliance wall", timestamp: "05:40", body: "Vesper evaluated five notetakers; all failed on data residency. Anything leaving the device is a non-starter — legal, not preference." },
      { title: "Pilot shape", timestamp: "19:22", body: "40 clinicians across two sites. Success criteria: note quality, zero IT lift, and a one-click audit export into their SIEM." },
      { title: "Budget & timeline", timestamp: "38:10", body: "Budget is allocated this quarter. Decision window is six weeks. Security review is the gating step, not procurement." },
    ],
    decisions: ["Vesper pilot scoped to 40 clinicians", "Audit export to SIEM is a launch requirement, not a nice-to-have"],
    transcript: [
      { id: "t1", speakerId: "lin", start: 0, text: "Thanks for making time. To kick off — what broke with the tools you've already tried?" },
      { id: "t2", speakerId: "you", start: 8, text: "Their answer, paraphrasing: every one of them phones home. Legal killed all five evaluations on data residency alone." },
      { id: "t3", speakerId: "lin", start: 22, text: "That's exactly the wall we built Open Granola behind. Everything runs on the device — transcript, summary, the lot." },
      { id: "t4", speakerId: "you", start: 34, text: "They want a forty-clinician pilot, two sites, and a hard requirement: one-click audit export into their SIEM." },
      { id: "t5", speakerId: "lin", start: 46, text: "Doable. Budget confirmed this quarter, six-week decision window, and the gate is their security review. I'll send the whitepaper tonight." },
    ],
  },
];

export const ACTION_ITEMS = [
  { id: "a1", text: "Wire 92 kB bundle-size check into CI", owner: "Devon Park", due: "Jul 24", done: false, meetingId: "m-aurora-q3", meetingTitle: "Aurora — Q3 launch plan" },
  { id: "a2", text: "Send motion spec for sign-off (240 ms + reduced-motion fallbacks)", owner: "Amara Osei", due: "Jul 18", done: false, meetingId: "m-aurora-q3", meetingTitle: "Aurora — Q3 launch plan" },
  { id: "a3", text: "Redraft rollout brief for three-phase launch", owner: "Lin Zhao", due: "Jul 20", done: false, meetingId: "m-aurora-q3", meetingTitle: "Aurora — Q3 launch plan" },
  { id: "a4", text: "Churn sensitivity model for usage-based tier", owner: "Priya Nair", due: "Jul 21", done: false, meetingId: "m-nimbus-review", meetingTitle: "Nimbus pricing review w/ Marcus" },
  { id: "a5", text: "Synthetic edit-history generator for tombstone bug", owner: "Priya Nair", due: "Jul 18", done: true, meetingId: "m-standup", meetingTitle: "Eng standup — offline sync deep-dive" },
  { id: "a6", text: "Send security whitepaper to Vesper legal", owner: "Lin Zhao", due: "Jul 12", done: true, meetingId: "m-client-vesper", meetingTitle: "Vesper Health — discovery call" },
  { id: "a7", text: "Scope SIEM audit-export format with Vesper IT", owner: "You", due: "Jul 22", done: false, meetingId: "m-client-vesper", meetingTitle: "Vesper Health — discovery call" },
];

export const TEMPLATES: Template[] = [
  { id: "tp1", name: "Product sync", icon: "Layers", structure: ["Chapters & timestamps", "Decisions", "Action items with owners", "Open risks"] },
  { id: "tp2", name: "1:1", icon: "Users", structure: ["Since last time", "Feedback both ways", "Growth notes", "Commitments"] },
  { id: "tp3", name: "Sales discovery", icon: "Target", structure: ["Pain & current stack", "Budget & timeline", "Decision process", "Next step"] },
  { id: "tp4", name: "Standup", icon: "Zap", structure: ["Done", "Doing", "Blocked", "Deep-dives"] },
  { id: "tp5", name: "Interview", icon: "Mic", structure: ["Candidate summary", "Signal by competency", "Concerns", "Recommendation"] },
  { id: "tp6", name: "Board update", icon: "Briefcase", structure: ["Highlights", "Metrics vs plan", "Asks", "Risks"] },
];

export const BRIEF: Brief = {
  meetingTitle: "Aurora checkpoint",
  startsIn: "2h 14m",
  participants: [PEOPLE.you, PEOPLE.amara, PEOPLE.devon, PEOPLE.lin],
  lastTime: {
    title: "Aurora — Q3 launch plan",
    date: "Jul 17",
    recap:
      "You locked a three-phase launch starting Aug 4 (tokens first), set a 92 kB bundle budget enforced in CI, and approved 240 ms motion with reduced-motion fallbacks. Two risks were left open: Figma sync flakiness and rollout comms.",
  },
  openCommitments: [
    { owner: "Devon Park", text: "Wire 92 kB bundle-size check into CI", due: "Jul 24" },
    { owner: "Amara Osei", text: "Send motion spec for sign-off", due: "Jul 18", overdue: true },
    { owner: "Lin Zhao", text: "Redraft rollout brief for three-phase launch", due: "Jul 20" },
  ],
  worthRaising: [
    "Amara's motion spec is a day overdue — is the checkpoint blocked on it?",
    "Figma sync flakiness was ~1-in-20 failures; ask for the current rate before phase one gates on it.",
    "Priya's analytics baseline was a precondition for CI enforcement — confirm it landed.",
  ],
};

export const COMMITMENTS: Commitment[] = [
  { id: "c1", text: "Wire 92 kB bundle-size check into CI", owner: "Devon Park", madeIn: "Aurora — Q3 launch plan", meetingId: "m-aurora-q3", madeOn: "2026-07-17", due: "Jul 24", status: "open", ageDays: 2 },
  { id: "c2", text: "Send motion spec for sign-off (240 ms + reduced-motion fallbacks)", owner: "Amara Osei", madeIn: "Aurora — Q3 launch plan", meetingId: "m-aurora-q3", madeOn: "2026-07-17", due: "Jul 18", status: "overdue", ageDays: 2 },
  { id: "c3", text: "Redraft rollout brief for three-phase launch", owner: "Lin Zhao", madeIn: "Aurora — Q3 launch plan", meetingId: "m-aurora-q3", madeOn: "2026-07-17", due: "Jul 20", status: "open", ageDays: 2 },
  { id: "c4", text: "Churn sensitivity model for usage-based tier", owner: "Priya Nair", madeIn: "Nimbus pricing review w/ Marcus", meetingId: "m-nimbus-review", madeOn: "2026-07-16", due: "Jul 21", status: "open", ageDays: 3 },
  { id: "c5", text: "Build synthetic edit-history generator for tombstone bug", owner: "Priya Nair", madeIn: "Eng standup — offline sync deep-dive", meetingId: "m-standup", madeOn: "2026-07-15", due: "Jul 18", status: "kept", ageDays: 4 },
  { id: "c6", text: "Send security whitepaper to Vesper legal", owner: "Lin Zhao", madeIn: "Vesper Health — discovery call", meetingId: "m-client-vesper", madeOn: "2026-07-11", due: "Jul 12", status: "kept", ageDays: 8 },
  { id: "c7", text: "Scope SIEM audit-export format with Vesper IT", owner: "You", madeIn: "Vesper Health — discovery call", meetingId: "m-client-vesper", madeOn: "2026-07-11", due: "Jul 22", status: "open", ageDays: 8 },
];

export const RECIPES: Recipe[] = [
  {
    id: "r1",
    name: "Objection miner",
    author: "@opengranola",
    downloads: 1284,
    description: "Pulls every objection from a sales call, verbatim, with the answer that landed.",
    prompt:
      "From this transcript, list every objection the prospect raised. For each: the verbatim quote with timestamp, the underlying concern in one line, and which response (if any) resolved it. Close with the two objections most likely to resurface.",
  },
  {
    id: "r2",
    name: "Board-update extractor",
    author: "@opengranola",
    downloads: 947,
    description: "Turns a leadership sync into a board-ready metrics narrative.",
    prompt:
      "Extract: (1) metrics vs plan with exact numbers, (2) the three most board-worthy highlights, (3) every risk named with its owner, (4) asks made of leadership. Format as four headed sections, board tone, no fluff.",
  },
  {
    id: "r3",
    name: "Hiring signal scorer",
    author: "@community",
    downloads: 631,
    description: "Scores an interview transcript against your rubric with evidence.",
    prompt:
      "Score this interview against these competencies: ownership, technical depth, communication, ambiguity tolerance. For each: score 1–5, then two verbatim evidence quotes with timestamps. End with a hire/no-hire recommendation and the strongest counter-signal.",
  },
  {
    id: "r4",
    name: "Decision archaeology",
    author: "@community",
    downloads: 512,
    description: "Reconstructs how a decision actually got made, across the whole meeting.",
    prompt:
      "Pick the most consequential decision in this meeting. Reconstruct: who proposed it, what alternatives were raised, the turning-point argument, who objected and on what grounds, and the final rationale. Cite timestamps throughout.",
  },
];

export const MODELS = [
  { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", kind: "Transcription", size: "1.5 GB", status: "installed", note: "99 languages · best accuracy" },
  { id: "parakeet-tdt-v3", name: "Parakeet TDT v3", kind: "Transcription", size: "2.3 GB", status: "available", note: "Fastest on NVIDIA/Metal" },
  { id: "qwen3-4b", name: "Qwen3 4B (Q4)", kind: "Notes & chat", size: "2.6 GB", status: "installed", note: "Great summaries, low RAM" },
  { id: "llama31-8b", name: "Llama 3.1 8B (Q4)", kind: "Notes & chat", size: "4.9 GB", status: "available", note: "Sharper reasoning, heavier" },
  { id: "nomic-embed", name: "Nomic Embed v1.5", kind: "Search embeddings", size: "0.3 GB", status: "installed", note: "Powers semantic search" },
];

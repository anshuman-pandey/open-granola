export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  role?: string;
}

export interface TranscriptSegment {
  id: string;
  speakerId: string;
  start: number; // seconds
  text: string;
}

export interface ActionItem {
  id: string;
  text: string;
  owner: string;
  due?: string;
  done: boolean;
  meetingId: string;
  meetingTitle: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string; // ISO
  durationMin: number;
  participants: Person[];
  summary: string;
  chapters: { title: string; timestamp: string; body: string }[];
  decisions: string[];
  transcript: TranscriptSegment[];
  tags: string[];
  template: string;
  starred?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: { meetingId: string; label: string }[];
}

export interface LiveSuggestion {
  id: string;
  kind: "answer" | "fact" | "follow-up" | "recall";
  title: string;
  body: string;
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  structure: string[];
}

export interface Brief {
  meetingTitle: string;
  startsIn: string;
  participants: Person[];
  lastTime: { title: string; date: string; recap: string };
  openCommitments: { owner: string; text: string; due?: string; overdue?: boolean }[];
  worthRaising: string[];
}

export interface Commitment {
  id: string;
  text: string;
  owner: string;
  madeIn: string; // meeting title
  meetingId: string;
  madeOn: string; // ISO date
  due?: string;
  status: "open" | "kept" | "overdue";
  ageDays: number;
}

export interface Recipe {
  id: string;
  name: string;
  author: string;
  downloads: number;
  description: string;
  prompt: string;
}

export type View =
  | { kind: "home" }
  | { kind: "meeting"; id: string }
  | { kind: "actions" }
  | { kind: "commitments" }
  | { kind: "templates" }
  | { kind: "settings" };

export interface PortableSegment {
  start: number;
  end?: number;
  speaker?: string;
  text: string;
}
export interface PortableNote {
  title: string;
  created_at: string;
  summary: string;
  transcript: PortableSegment[];
}
export interface TranscriptDocument {
  format: "open-granola.transcript";
  version: 1;
  notes: PortableNote[];
}
export const TRANSCRIPT_FORMAT: "open-granola.transcript";
export const MAX_TRANSCRIPT_BYTES: number;
export function transcriptDate(raw: string): string;
export function validateTranscriptDocument(value: unknown): TranscriptDocument;
export function parseTranscriptDocument(content: string): TranscriptDocument;
export function importTranscript(
  content: string,
  options: { format: "srt" | "vtt" | "txt"; title: string; createdAt: string },
): TranscriptDocument;
export function exportTranscript(
  value: unknown,
  format: "json" | "markdown" | "srt" | "vtt",
  noteIndex?: number,
): string;

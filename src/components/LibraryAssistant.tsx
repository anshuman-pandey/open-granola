import {
  ArrowRight,
  BookOpen,
  LoaderCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import type { LibraryAnswer } from "../lib/library-answer";

export interface LibraryQuestion {
  question: string;
  answer: LibraryAnswer | null;
  pending: boolean;
  error: string | null;
}

interface Props {
  state: LibraryQuestion;
  demo: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
  onOpenMeeting: (id: string) => void;
}

export function LibraryAssistant({
  state,
  demo,
  onAsk,
  onClose,
  onOpenMeeting,
}: Props) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[680px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener.current?.isConnected) opener.current.focus();
        }}
      >
        <header className="flex items-center gap-3 border-b border-border/70 px-6 py-5 pr-12">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
            <Sparkles size={18} />
          </span>
          <div>
            <DialogTitle className="font-display text-[27px] font-normal">
              Ask your meetings
            </DialogTitle>
            <DialogDescription className="mt-1 text-[11px]">
              {demo
                ? "Demo · excerpts from the sample library"
                : "Answers from your notes · processed on this device"}
            </DialogDescription>
          </div>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <p className="section-eyebrow">Your question</p>
          <h2 className="mt-2 text-[17px] font-medium leading-relaxed">
            {state.question}
          </h2>
          <div
            className="mt-5 border-t border-border/70 pt-5"
            aria-live="polite"
            aria-busy={state.pending}
          >
            {state.pending ? (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <LoaderCircle size={16} className="animate-spin text-primary" />
                Reading your local notes…
              </p>
            ) : state.error ? (
              <div
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/5 p-4"
              >
                <p className="text-sm leading-relaxed">{state.error}</p>
                <button
                  onClick={() => onAsk(state.question)}
                  className="mt-3 text-xs font-semibold text-primary underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-[1.85] text-foreground/85">
                {state.answer?.text}
              </p>
            )}
          </div>
          {!!state.answer?.sources.length && (
            <section aria-label="Source notes" className="mt-6">
              <h3 className="section-eyebrow">Explore the source notes</h3>
              <div className="mt-3 space-y-2">
                {state.answer.sources.map((source) => (
                  <button
                    key={source.id}
                    onClick={() => onOpenMeeting(source.id)}
                    className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left text-xs transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <BookOpen
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {source.title}
                    </span>
                    <ArrowRight
                      size={13}
                      className="text-muted-foreground group-hover:text-primary"
                    />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
        <footer className="border-t border-border/70 bg-secondary/20 px-5 py-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim() && !state.pending) {
                onAsk(draft);
                setDraft("");
              }
            }}
            className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3 focus-within:border-primary/40"
          >
            <input
              ref={input}
              aria-label="Ask another library question"
              maxLength={4000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask another question…"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
            <button
              disabled={!draft.trim() || state.pending}
              type="submit"
              aria-label="Send library question"
              className="button-primary min-h-10 px-3"
            >
              <Send size={15} />
            </button>
          </form>
          <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
            {demo
              ? "Sample content only. Free-form AI answers run in the desktop app."
              : "Review generated answers against your original notes."}
          </p>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

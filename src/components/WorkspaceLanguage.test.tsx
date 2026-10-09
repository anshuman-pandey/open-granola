import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../i18n";
import { HomeView } from "./HomeView";
import { NoteView } from "./NoteView";
import { ProcessingHistory } from "./ProcessingHistory";
import type { Meeting } from "../lib/types";
import { translationCatalogs } from "../i18n/locales";

const meeting: Meeting = {
  id: "example",
  title: "Budget review — original title",
  date: "2026-12-02T10:00:00Z",
  durationMin: 12,
  participants: [],
  summary: "This source summary must stay in English.",
  chapters: [],
  decisions: ["Ship Friday"],
  tags: [],
  template: "Planning",
  transcript: [
    {
      id: "segment",
      speakerId: "unknown",
      start: 0,
      text: "Keep the source transcript as written.",
    },
  ],
};

beforeEach(() => {
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("translated workspace", () => {
  it.each(["ja", "zh-CN", "zh-TW"] as const)(
    "shows translated %s workspace and transcript controls while preserving source content",
    (locale) => {
      window.localStorage.setItem("open-granola-language", locale);
      const t = (message: string) => translationCatalogs[locale][message];
      const home = render(
        <LanguageProvider>
          <HomeView
            meetings={[meeting]}
            brief={null}
            onOpenMeeting={vi.fn()}
            onRecord={vi.fn()}
            onAsk={vi.fn()}
          />
        </LanguageProvider>,
      );
      expect(
        screen.getByRole("heading", { name: t("Your meeting library") }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: meeting.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(meeting.summary)).toBeInTheDocument();
      home.unmount();
      render(
        <LanguageProvider>
          <NoteView meeting={meeting} onToggleAction={vi.fn()} />
        </LanguageProvider>,
      );
      fireEvent.click(
        screen.getByRole("tab", { name: new RegExp(t("Transcript")) }),
      );
      expect(
        screen.getByRole("textbox", { name: t("Search this transcript") }),
      ).toBeInTheDocument();
      expect(screen.getByText(meeting.transcript[0].text)).toBeInTheDocument();
    },
  );
  it("translates Spanish controls and sends the typed question without changing meeting content", () => {
    window.localStorage.setItem("open-granola-language", "es");
    const onAsk = vi.fn();
    render(
      <LanguageProvider>
        <HomeView
          meetings={[meeting]}
          brief={null}
          onOpenMeeting={vi.fn()}
          onRecord={vi.fn()}
          onAsk={onAsk}
        />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "Tu biblioteca de reuniones" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: meeting.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(meeting.summary)).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Pregunta sobre tus reuniones" }),
      { target: { value: "¿Qué decidimos?" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Preguntar" }));
    expect(onAsk).toHaveBeenCalledWith("¿Qué decidimos?");
  });

  it("translates Hindi transcript controls without translating the transcript", () => {
    window.localStorage.setItem("open-granola-language", "hi");
    render(
      <LanguageProvider>
        <NoteView meeting={meeting} onToggleAction={vi.fn()} />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: /ट्रांसक्रिप्ट/ }));
    expect(
      screen.getByRole("textbox", { name: "इस ट्रांसक्रिप्ट में खोजें" }),
    ).toBeInTheDocument();
    expect(screen.getByText("अज्ञात वक्ता")).toBeInTheDocument();
    expect(screen.getByText(meeting.transcript[0].text)).toBeInTheDocument();
  });

  it("shows the recorded summary language while preserving raw provider errors", () => {
    window.localStorage.setItem("open-granola-language", "es");
    const historyMeeting: Meeting = {
      ...meeting,
      processingHistory: [
        {
          provider: "local",
          model: "example-model",
          endpoint: "",
          off_device: false,
          status: "completed",
          error: "RAW_PROVIDER_ERROR",
          started_at: "2026-12-02T10:00:00Z",
          completed_at: "2026-12-02T10:01:00Z",
          summary_language: "auto",
        },
      ],
    };
    const backend = {
      mode: "tauri" as const,
      getProviderSettings: vi.fn(),
      summarizeMeeting: vi.fn(),
    };
    render(
      <LanguageProvider>
        <ProcessingHistory meeting={historyMeeting} backend={backend} />
      </LanguageProvider>,
    );
    expect(
      screen.getAllByText("Idioma solicitado para el resumen: Idioma original"),
    ).toHaveLength(2);
    expect(screen.getAllByText("RAW_PROVIDER_ERROR")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Regenerar resumen" }),
    ).toBeInTheDocument();
  });
});

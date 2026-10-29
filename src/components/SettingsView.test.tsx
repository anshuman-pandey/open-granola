import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView";

const backend = vi.hoisted(() => ({
  mode: "tauri",
  modelStatus: vi.fn(),
  getLanguageSettings: vi.fn(),
  saveLanguageSettings: vi.fn(),
  purgeAll: vi.fn(),
  importGranola: vi.fn(),
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));
vi.mock("./ProviderSettings", () => ({ ProviderSettings: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  backend.modelStatus.mockResolvedValue({ retention_days: 90 });
  backend.importGranola.mockResolvedValue(1);
  backend.getLanguageSettings.mockResolvedValue({
    transcription_language: "hi",
    summary_language: "es",
  });
});

describe("transcript imports", () => {
  function file(name: string, content: string) {
    return Object.assign(new File([content], name), {
      arrayBuffer: async () => new TextEncoder().encode(content).buffer,
    });
  }
  it("converts a VTT file before calling native import without invoking a model", async () => {
    render(<SettingsView />);
    fireEvent.change(screen.getByLabelText("Choose meeting import"), {
      target: {
        files: [
          file(
            "Team review.vtt",
            "WEBVTT\n\n00:00.125 --> 00:02.500\n<v Mei>你好</v>\n",
          ),
        ],
      },
    });
    await waitFor(() => expect(backend.importGranola).toHaveBeenCalledOnce());
    const document = JSON.parse(backend.importGranola.mock.calls[0][0]);
    expect(document.format).toBe("open-granola.transcript");
    expect(document.notes[0].title).toBe("Team review");
    expect(document.notes[0].summary).toBe("");
    expect(document.notes[0].transcript).toEqual([
      { start: 0.125, end: 2.5, speaker: "Mei", text: "你好" },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Imported 1 meeting",
    );
  });
  it("rejects broken cues before the database receives any content", async () => {
    render(<SettingsView />);
    fireEvent.change(screen.getByLabelText("Choose meeting import"), {
      target: {
        files: [file("bad.srt", "1\n00:00:03,000 --> 00:00:01,000\nWrong\n")],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "subtitle timestamps",
    );
    expect(backend.importGranola).not.toHaveBeenCalled();
  });
  it("keeps legacy JSON import and blocks unsupported portable versions", async () => {
    render(<SettingsView />);
    const input = screen.getByLabelText("Choose meeting import");
    fireEvent.change(input, {
      target: { files: [file("legacy.json", '{"title":"Legacy"}')] },
    });
    await waitFor(() =>
      expect(backend.importGranola).toHaveBeenCalledWith('{"title":"Legacy"}'),
    );
    await waitFor(() => expect(input).not.toBeDisabled());
    backend.importGranola.mockClear();
    fireEvent.change(input, {
      target: {
        files: [
          file(
            "future.json",
            '{"format":"open-granola.transcript","version":2,"notes":[]}',
          ),
        ],
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Import failed");
    expect(backend.importGranola).not.toHaveBeenCalled();
  });
  it("disables imports while capture is active", () => {
    render(<SettingsView captureLocked />);
    expect(
      screen.getByRole("button", { name: "Choose import file" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Choose meeting import")).toBeDisabled();
  });
});

describe("library purge and language settings", () => {
  it.each([false, true])(
    "reloads native preferences after purge (cleanup error: %s)",
    async (cleanupError) => {
      backend.purgeAll.mockImplementation(async () => {
        backend.getLanguageSettings.mockResolvedValue({
          transcription_language: "auto",
          summary_language: "auto",
        });
        if (cleanupError)
          throw new Error("Library rows deleted; file cleanup failed");
      });
      render(<SettingsView />);
      await waitFor(() =>
        expect(screen.getByLabelText("Spoken language")).toHaveValue("hi"),
      );
      fireEvent.click(screen.getByRole("button", { name: "Delete library" }));
      const dialog = screen.getByRole("dialog", {
        name: "Delete your meeting library?",
      });
      fireEvent.change(
        within(dialog).getByLabelText("Type DELETE to confirm"),
        { target: { value: "DELETE" } },
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Delete library" }),
      );
      await waitFor(() =>
        expect(backend.getLanguageSettings).toHaveBeenCalledTimes(2),
      );
      await waitFor(() =>
        expect(screen.getByLabelText("Spoken language")).toHaveValue("auto"),
      );
      expect(screen.getByLabelText("Summary language")).toHaveValue("auto");
      expect(backend.saveLanguageSettings).not.toHaveBeenCalled();
    },
  );
});

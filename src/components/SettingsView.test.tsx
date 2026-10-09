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
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));
vi.mock("./ProviderSettings", () => ({ ProviderSettings: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  backend.modelStatus.mockResolvedValue({ retention_days: 90 });
  backend.getLanguageSettings.mockResolvedValue({
    transcription_language: "hi",
    summary_language: "es",
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

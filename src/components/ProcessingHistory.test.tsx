import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Meeting, SummaryRun } from "../lib/types";
import { defaultProviderConfig } from "../lib/provider-types";
import type { ProviderStatus } from "../lib/provider-types";
import { ProcessingHistory } from "./ProcessingHistory";
import { NoteView } from "./NoteView";

const backend = vi.hoisted(() => ({
  mode: "tauri" as "tauri" | "demo",
  getProviderSettings: vi.fn(),
  summarizeMeeting: vi.fn(),
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));

const meeting: Meeting = {
  id: "saved-meeting",
  title: "Original meeting title",
  date: "2026-10-01T10:00:00Z",
  durationMin: 20,
  participants: [],
  summary: "The existing note says the release remains scheduled for Friday.",
  chapters: [],
  decisions: ["Release on Friday"],
  transcript: [{ id: "s1", speakerId: "sp-0", start: 0, text: "We agreed to release on Friday." }],
  tags: [],
  template: "Meeting notes",
};
const cloud: ProviderStatus = {
  config: { ...defaultProviderConfig("openai"), model: "reviewed-model", allow_remote: true },
  has_api_key: true,
  credential_storage: "os_keychain",
  uses_network: true,
  sends_transcript_off_device: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  backend.mode = "tauri";
  backend.getProviderSettings.mockResolvedValue(structuredClone(cloud));
  backend.summarizeMeeting.mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
});

describe("summary destination review", () => {
  it("reviews the destination before any generation and returns focus on cancel", async () => {
    render(<ProcessingHistory meeting={meeting} />);
    const trigger = screen.getByRole("button", { name: "Regenerate summary" });
    expect(backend.getProviderSettings).not.toHaveBeenCalled();
    expect(backend.summarizeMeeting).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    const review = await screen.findByRole("group", { name: "Review summary destination" });
    expect(review).toHaveFocus();
    expect(review).toHaveTextContent("OpenAI API · reviewed-model");
    expect(review).toHaveTextContent("https://api.openai.com/v1");
    expect(review).toHaveTextContent("This sends this meeting’s transcript and template");
    expect(backend.summarizeMeeting).not.toHaveBeenCalled();
    await userEvent.click(within(review).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Review summary destination" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(backend.summarizeMeeting).not.toHaveBeenCalled();
  });

  it("pins the confirmed configuration and blocks duplicate submissions while running", async () => {
    let finish!: () => void;
    backend.summarizeMeeting.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onAttempt = vi.fn().mockResolvedValue(undefined);
    render(<ProcessingHistory meeting={meeting} onAttempt={onAttempt} />);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send text and regenerate" }));
    expect(backend.summarizeMeeting).toHaveBeenCalledExactlyOnceWith(meeting.id, cloud.config);
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(onAttempt).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    expect(await screen.findByRole("status")).toHaveTextContent("Summary updated");
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Review summary destination" })).not.toBeInTheDocument();
  });

  it("preserves the displayed note after a failed attempt and refreshes its processing history", async () => {
    backend.summarizeMeeting.mockRejectedValueOnce("Provider unavailable. Your saved note is unchanged.");
    const onAttempt = vi.fn().mockResolvedValue(undefined);
    render(<NoteView meeting={meeting} onToggleAction={vi.fn()} onSummaryAttempt={onAttempt} />);
    expect(screen.getByText(meeting.summary)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send text and regenerate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByText(meeting.summary)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: meeting.title })).toBeInTheDocument();
    expect(screen.getByText("Release on Friday")).toBeInTheDocument();
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Send text and regenerate" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Send text and regenerate" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Summary updated");
    expect(onAttempt).toHaveBeenCalledTimes(2);
  });

  it("requires another review to use changed provider settings after a rejected attempt", async () => {
    backend.summarizeMeeting.mockRejectedValueOnce("The provider changed. Review the selected destination and try again.");
    render(<ProcessingHistory meeting={meeting} />);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send text and regenerate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("provider changed");
    const local: ProviderStatus = { ...cloud, config: defaultProviderConfig("local"), uses_network: false, sends_transcript_off_device: false, has_api_key: false };
    backend.getProviderSettings.mockResolvedValue(local);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    const generate = await screen.findByRole("button", { name: "Generate summary" });
    expect(backend.summarizeMeeting).toHaveBeenCalledTimes(1);
    await userEvent.click(generate);
    expect(backend.summarizeMeeting).toHaveBeenLastCalledWith(meeting.id, local.config);
  });

  it.each([
    { transcript: [] },
    { transcript: [{ id: "empty", speakerId: "sp-0", start: 0, text: "  \n " }] },
  ])("does not offer generation without transcript text", ({ transcript }) => {
    render(<ProcessingHistory meeting={{ ...meeting, transcript }} />);
    expect(screen.getByRole("button", { name: "Regenerate summary" })).toBeDisabled();
    expect(screen.getByText("A saved transcript is required to generate a summary.")).toBeInTheDocument();
    expect(backend.getProviderSettings).not.toHaveBeenCalled();
    expect(backend.summarizeMeeting).not.toHaveBeenCalled();
  });

  it("keeps destination loading failures visible without submitting a summary", async () => {
    backend.getProviderSettings.mockRejectedValueOnce("Provider settings could not be read.");
    render(<ProcessingHistory meeting={meeting} />);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be read");
    expect(screen.getByRole("button", { name: "Regenerate summary" })).toBeEnabled();
    expect(backend.summarizeMeeting).not.toHaveBeenCalled();
  });

  it("shows the latest successful model alongside failed attempts and the local-server forwarding caveat", async () => {
    const runs: SummaryRun[] = [
      { provider: "openai", model: "cloud-model", endpoint: "https://api.openai.com/v1", off_device: true, status: "failed", error: "Rate limit reached", started_at: "2026-10-01T12:00:00Z", completed_at: "2026-10-01T12:00:02Z" },
      { provider: "lm_studio", model: "local-model", endpoint: "http://127.0.0.1:1234/v1", off_device: false, status: "completed", error: null, started_at: "2026-10-01T11:00:00Z", completed_at: "2026-10-01T11:00:04Z" },
    ];
    render(<ProcessingHistory meeting={{ ...meeting, processingHistory: runs }} />);
    expect(screen.getByText("Last summary attempt failed · saved note preserved")).toBeInTheDocument();
    expect(screen.getByText("LM Studio · local-model")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Processing history · 2 attempts"));
    expect(screen.getByText(/A failed request may still have sent text/)).toBeVisible();
    expect(screen.getByText(/A local server can forward requests/)).toBeVisible();
    expect(screen.getByText("Remote text processing · https://api.openai.com/v1")).toBeVisible();
    expect(screen.getByText("Local processing route · http://127.0.0.1:1234/v1")).toBeVisible();
  });

  it("reports a refresh failure without pretending the successful generation failed", async () => {
    const onAttempt = vi.fn().mockRejectedValue(new Error("Storage refresh failed"));
    render(<ProcessingHistory meeting={meeting} onAttempt={onAttempt} />);
    await userEvent.click(screen.getByRole("button", { name: "Regenerate summary" }));
    await userEvent.click(await screen.findByRole("button", { name: "Send text and regenerate" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Reopen it to see the saved result"));
    expect(screen.getByRole("status")).toHaveTextContent("Summary updated");
    expect(backend.summarizeMeeting).toHaveBeenCalledTimes(1);
  });

  it("hides native processing claims in the browser demo", () => {
    backend.mode = "demo";
    render(<ProcessingHistory meeting={meeting} />);
    expect(screen.queryByRole("region", { name: "Summary processing" })).not.toBeInTheDocument();
    expect(backend.getProviderSettings).not.toHaveBeenCalled();
  });
});

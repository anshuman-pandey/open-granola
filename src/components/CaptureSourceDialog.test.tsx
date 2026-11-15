import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CaptureSourceDialog } from "./CaptureSourceDialog";
import { LanguageProvider } from "../i18n";
const status = vi.hoisted(() => vi.fn());
vi.mock("../lib/backend", () => ({ getBackend: () => ({ modelStatus: status }) }));
beforeEach(() => { status.mockResolvedValue({ capabilities: { system_audio: true } }); });
function setup() {
  const start = vi.fn();
  render(<LanguageProvider><CaptureSourceDialog onStart={start} onClose={() => {}} /></LanguageProvider>);
  return start;
}
it("defaults to microphone and sends system audio only after explicit opt-in", async () => {
  const start = setup();
  const toggle = screen.getByRole("checkbox");
  await waitFor(() => expect(toggle).toBeEnabled());
  expect(toggle).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
  expect(start).toHaveBeenLastCalledWith(false);
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
  expect(start).toHaveBeenLastCalledWith(true);
});
it("cannot request system audio on unsupported or unavailable capability data", async () => {
  status.mockRejectedValue(new Error("offline"));
  const start = setup();
  await waitFor(() => expect(status).toHaveBeenCalled());
  expect(screen.getByRole("checkbox")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
  expect(start).toHaveBeenCalledWith(false);
});

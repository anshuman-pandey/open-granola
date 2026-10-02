import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderSettings } from "./ProviderSettings";
import { defaultProviderConfig, DEMO_PROVIDER_STATUS } from "../lib/provider-types";

const backend = vi.hoisted(() => ({
  mode: "tauri",
  getProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
  testProviderConnection: vi.fn(),
  chatgptAuthStatus: vi.fn(),
  chatgptModels: vi.fn(),
  startChatgptSignIn: vi.fn(),
  cancelChatgptSignIn: vi.fn(),
  disconnectChatgpt: vi.fn(),
}));
vi.mock("../lib/backend", () => ({ getBackend: () => backend }));

beforeEach(() => {
  vi.clearAllMocks();
  backend.mode = "tauri";
  backend.getProviderSettings.mockResolvedValue(structuredClone(DEMO_PROVIDER_STATUS));
  backend.saveProviderSettings.mockImplementation(async ({ config }) => ({
    config,
    has_api_key: true,
    credential_storage: "os_keychain",
    uses_network: true,
    sends_transcript_off_device: true,
  }));
  backend.testProviderConnection.mockResolvedValue({ ok: true, message: "Sample response received." });
  backend.chatgptAuthStatus.mockResolvedValue({
    state: "signed_out", detail: "Not connected", credential_storage: "none", accounts: [], active_account_id: null,
  });
  backend.chatgptModels.mockResolvedValue([{ id: "account-model", label: "Account model" }]);
});

async function choose(provider: string) {
  const select = screen.getByRole("combobox", { name: "Summary & assistant provider" });
  await waitFor(() => expect(select).toBeEnabled());
  await userEvent.selectOptions(select, provider);
}

describe("model connections", () => {
  it("requires consent, saves the selected model, then tests without passing meeting content", async () => {
    const changed = vi.fn();
    render(<ProviderSettings onSaved={changed} />);
    await choose("openai");
    await userEvent.type(screen.getByLabelText("Model ID"), "test-text-model");
    await userEvent.type(screen.getByLabelText("API key"), "key-for-test");
    await userEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Allow text to be sent");
    expect(backend.saveProviderSettings).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    await screen.findByText("Settings saved. Test the connection before your next meeting.");
    expect(backend.saveProviderSettings).toHaveBeenCalledExactlyOnceWith({
      config: { provider: "openai", base_url: "https://api.openai.com/v1", model: "test-text-model", allow_remote: true },
      apiKey: "key-for-test",
    });
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(changed).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Sample response received.")).toBeInTheDocument();
    expect(backend.testProviderConnection).toHaveBeenCalledExactlyOnceWith();

    await userEvent.type(screen.getByLabelText("Model ID"), "-changed");
    expect(screen.queryByText("Sample response received.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  });

  it("keeps connection failures visible and permits retry", async () => {
    backend.testProviderConnection.mockRejectedValueOnce("No model loaded. Load a model in LM Studio.");
    backend.getProviderSettings.mockResolvedValue({
      ...DEMO_PROVIDER_STATUS,
      config: { ...defaultProviderConfig("lm_studio"), model: "local-model" },
      uses_network: true,
    });
    render(<ProviderSettings />);
    const button = screen.getByRole("button", { name: "Test connection" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("No model loaded");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(await screen.findByText("Sample response received.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("resets consent and clears a pending key when the server address changes", async () => {
    render(<ProviderSettings />);
    await choose("openai_compatible");
    fireEvent.change(screen.getByLabelText("API base URL"), { target: { value: "https://one.example/v1" } });
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    await userEvent.type(screen.getByLabelText("API key (if required)"), "private-key");
    fireEvent.change(screen.getByLabelText("API base URL"), { target: { value: "https://two.example/v1" } });
    expect(screen.getByRole("checkbox", { name: /I allow transcripts/ })).not.toBeChecked();
    expect(screen.getByLabelText("API key (if required)")).toHaveValue("");
    expect(backend.saveProviderSettings).not.toHaveBeenCalled();
  });

  it("allows saved credentials to be removed without returning them to the form", async () => {
    const config = { ...defaultProviderConfig("anthropic"), model: "test-model", allow_remote: true };
    backend.getProviderSettings.mockResolvedValue({
      config, has_api_key: true, credential_storage: "session", uses_network: true, sends_transcript_off_device: true,
    });
    render(<ProviderSettings />);
    expect(await screen.findByText(/kept for this app session only/)).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    await userEvent.click(screen.getByRole("checkbox", { name: "Remove the saved API key when saving" }));
    await userEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    await waitFor(() => expect(backend.saveProviderSettings).toHaveBeenCalledExactlyOnceWith({ config, clearApiKey: true }));
  });

  it("previews provider choices in the browser without accepting keys or claiming a connection", async () => {
    backend.mode = "demo";
    const store = vi.spyOn(Storage.prototype, "setItem");
    render(<ProviderSettings />);
    await choose("openai");
    expect(screen.getByText("Text leaves this device")).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save model settings" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    expect(backend.saveProviderSettings).not.toHaveBeenCalled();
    expect(backend.testProviderConnection).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    store.mockRestore();
  });

  it("requires a conscious text-sharing choice before opening ChatGPT sign-in", async () => {
    backend.startChatgptSignIn.mockResolvedValue(undefined);
    render(<ProviderSettings />);
    await choose("chatgpt");
    const button = screen.getByRole("button", { name: "Continue with ChatGPT" });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(backend.startChatgptSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("before connecting your account");
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    backend.chatgptAuthStatus.mockResolvedValue({ state: "pending", detail: "Complete sign-in in your browser.", credential_storage: "none", accounts: [], active_account_id: null });
    await userEvent.click(button);
    expect(await screen.findByRole("button", { name: "Cancel sign-in" })).toBeInTheDocument();
    expect(backend.startChatgptSignIn).toHaveBeenCalledExactlyOnceWith({ allowRemote: true, accountId: null });
  });

  it("defaults to the active registration and keeps it visible after a failed reauthorization", async () => {
    const account = { id: "saved-account", label: "Work account · a1b2c3d4" };
    backend.chatgptAuthStatus.mockResolvedValue({
      state: "error", detail: "The latest sign-in was declined.",
      credential_storage: "session", accounts: [account], active_account_id: account.id,
    });
    render(<ProviderSettings />);
    await choose("chatgpt");
    expect(await screen.findByText(`Active account: ${account.label}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Account for sign-in")).toHaveValue(account.id);
    expect(screen.getByRole("button", { name: "Disconnect ChatGPT" })).toBeEnabled();
    expect(screen.getByText(/Connected for this app session only/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue with ChatGPT" }));
    expect(backend.startChatgptSignIn).toHaveBeenCalledExactlyOnceWith({ allowRemote: true, accountId: account.id });
  });

  it("loads account models only on a consented click and uses the selected model ID", async () => {
    const account = { id: "a", label: "Personal account" };
    backend.chatgptAuthStatus.mockResolvedValue({ state: "signed_in", detail: "Connected", credential_storage: "os_keychain", accounts: [account], active_account_id: account.id });
    render(<ProviderSettings />);
    await choose("chatgpt");
    const load = await screen.findByRole("button", { name: "Load available models" });
    expect(load).toBeDisabled();
    expect(backend.chatgptModels).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    expect(backend.chatgptModels).not.toHaveBeenCalled();
    await userEvent.click(load);
    const models = await screen.findByRole("combobox", { name: "Available account models" });
    expect(backend.chatgptModels).toHaveBeenCalledExactlyOnceWith();
    await userEvent.selectOptions(models, "account-model");
    expect(screen.getByLabelText("Model ID")).toHaveValue("account-model");
    expect(screen.getByText(/a listed model may not support this workflow/)).toBeInTheDocument();
    expect(backend.testProviderConnection).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save model settings" }));
    expect(backend.saveProviderSettings).toHaveBeenCalledExactlyOnceWith({ config: { ...defaultProviderConfig("chatgpt"), model: "account-model", allow_remote: true } });
  });

  it("clears the catalog when the provider or selected account changes", async () => {
    const accounts = [{ id: "a", label: "Personal account" }, { id: "b", label: "Work account" }];
    backend.chatgptAuthStatus.mockResolvedValue({ state: "signed_in", detail: "Connected", credential_storage: "os_keychain", accounts, active_account_id: "a" });
    render(<ProviderSettings />);
    await choose("chatgpt");
    await screen.findByRole("button", { name: "Load available models" });
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    await userEvent.click(screen.getByRole("button", { name: "Load available models" }));
    await screen.findByRole("combobox", { name: "Available account models" });
    await userEvent.selectOptions(screen.getByLabelText("Account for sign-in"), "b");
    expect(screen.queryByRole("combobox", { name: "Available account models" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load available models" })).toBeDisabled();
    backend.chatgptAuthStatus.mockResolvedValue({ state: "signed_in", detail: "Work connected", credential_storage: "os_keychain", accounts, active_account_id: "b" });
    backend.chatgptModels.mockResolvedValue([{ id: "work-model", label: "Work model" }]);
    await userEvent.click(screen.getByRole("button", { name: "Continue with ChatGPT" }));
    await screen.findByText("Work connected");
    await userEvent.click(screen.getByRole("button", { name: "Load available models" }));
    const models = await screen.findByRole("combobox", { name: "Available account models" });
    expect(models).toHaveTextContent("work-model");
    expect(models).not.toHaveTextContent("account-model");
    await choose("local");
    await choose("chatgpt");
    expect(screen.queryByRole("combobox", { name: "Available account models" })).not.toBeInTheDocument();
    expect(backend.chatgptModels).toHaveBeenCalledTimes(2);
  });

  it("clears model choices on sign-out and leaves manual entry available after catalog failures", async () => {
    const account = { id: "a", label: "Personal account" };
    backend.chatgptAuthStatus.mockResolvedValue({ state: "signed_in", detail: "Connected", credential_storage: "session", accounts: [account], active_account_id: "a" });
    backend.chatgptModels.mockRejectedValueOnce("Model catalog is unavailable. Try again later.");
    render(<ProviderSettings />);
    await choose("chatgpt");
    await screen.findByRole("button", { name: "Load available models" });
    await userEvent.click(screen.getByRole("checkbox", { name: /I allow transcripts/ }));
    await userEvent.click(screen.getByRole("button", { name: "Load available models" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Model catalog is unavailable");
    expect(screen.getByLabelText("Model ID")).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Load available models" }));
    await screen.findByRole("combobox", { name: "Available account models" });
    backend.chatgptAuthStatus.mockResolvedValue({ state: "signed_out", detail: "Signed out", credential_storage: "none", accounts: [account], active_account_id: "a" });
    await userEvent.click(screen.getByRole("button", { name: "Disconnect ChatGPT" }));
    await screen.findByText("Signed out");
    expect(screen.queryByRole("combobox", { name: "Available account models" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load available models" })).not.toBeInTheDocument();
  });
});

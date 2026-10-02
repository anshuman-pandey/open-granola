import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultProviderConfig } from "./provider-types";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
});

describe("provider bridge", () => {
  it("sends credentials to native IPC and makes the sample test with no content argument", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
    const { getBackend } = await import("./backend");
    const backend = getBackend();
    const config = { ...defaultProviderConfig("openai"), model: "test-model", allow_remote: true };
    await backend.saveProviderSettings({ config, apiKey: "test-key" });
    expect(invoke).toHaveBeenCalledWith("save_provider_settings", { config, apiKey: "test-key", clearApiKey: false });
    await backend.testProviderConnection();
    expect(invoke).toHaveBeenLastCalledWith("test_provider_connection", undefined);
    await backend.chatgptModels();
    expect(invoke).toHaveBeenLastCalledWith("list_chatgpt_models", undefined);
  });
  it("rejects browser mutations and checks instead of pretending to save or connect", async () => {
    const { getBackend } = await import("./backend");
    const backend = getBackend();
    await expect(backend.saveProviderSettings({ config: defaultProviderConfig("openai"), apiKey: "discard-this" })).rejects.toThrow("does not save credentials");
    await expect(backend.testProviderConnection()).rejects.toThrow("desktop app");
    await expect(backend.startChatgptSignIn({ allowRemote: true })).rejects.toThrow("desktop app");
    await expect(backend.chatgptModels()).rejects.toThrow("desktop app");
    expect(invoke).not.toHaveBeenCalled();
    expect((await backend.getProviderSettings()).has_api_key).toBe(false);
  });
});

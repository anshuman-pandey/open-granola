import { describe, expect, it } from "vitest";
import { defaultProviderConfig, sendsTextOffDevice, validateProviderConfig } from "./provider-types";

describe("provider boundary feedback", () => {
  it.each(["http://127.0.0.1:1234/v1", "http://127.0.0.2:1234/v1", "http://[::1]:1234/v1"])("recognizes the loopback address %s", (base_url) => {
    const config = { ...defaultProviderConfig("lm_studio"), model: "local-model", base_url };
    expect(sendsTextOffDevice(config)).toBe(false);
    expect(validateProviderConfig(config)).toBeNull();
  });
  it("treats a LAN machine and misleading localhost names as another device", () => {
    for (const base_url of ["https://192.168.1.20/v1", "https://localhost.example/v1", "https://127.0.0.1.example/v1"]) {
      const config = { ...defaultProviderConfig("openai_compatible"), model: "model", base_url };
      expect(sendsTextOffDevice(config)).toBe(true);
      expect(validateProviderConfig(config)).toContain("Allow text");
    }
  });
  it("rejects remote HTTP, embedded credentials, and query-string secrets", () => {
    for (const base_url of ["http://provider.example/v1", "https://user:secret@provider.example/v1", "https://provider.example/v1?api_key=secret"]) {
      expect(validateProviderConfig({ ...defaultProviderConfig("openai_compatible"), model: "model", allow_remote: true, base_url })).not.toBeNull();
    }
  });
  it("requires an actual model and keeps remote endpoints out of the local LM Studio choice", () => {
    expect(validateProviderConfig(defaultProviderConfig("lm_studio"))).toContain("model ID");
    expect(validateProviderConfig({ ...defaultProviderConfig("lm_studio"), model: "model", base_url: "https://server.example/v1", allow_remote: true })).toContain("LM Studio must use");
    expect(validateProviderConfig({ ...defaultProviderConfig("lm_studio"), model: "model", base_url: "http://localhost:1234/v1" })).toContain("instead of localhost");
  });
});

export type SummaryProvider =
  | "local"
  | "lm_studio"
  | "openai"
  | "anthropic"
  | "openai_compatible"
  | "chatgpt";

export interface ProviderConfig {
  provider: SummaryProvider;
  base_url: string;
  model: string;
  allow_remote: boolean;
}

export interface ProviderStatus {
  config: ProviderConfig;
  has_api_key: boolean;
  credential_storage: "os_keychain" | "session" | "none";
  uses_network: boolean;
  sends_transcript_off_device: boolean;
}

export interface SaveProviderSettings {
  config: ProviderConfig;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export interface ChatgptAuthStatus {
  state: "signed_out" | "pending" | "signed_in" | "error";
  detail: string;
  credential_storage: "os_keychain" | "session" | "none";
  accounts: { id: string; label: string }[];
  active_account_id: string | null;
}

export interface ChatgptModel {
  id: string;
  label: string;
}

export const PROVIDER_LABELS: Record<SummaryProvider, string> = {
  local: "Built-in local model",
  lm_studio: "LM Studio",
  openai: "OpenAI API",
  anthropic: "Claude API",
  openai_compatible: "Custom OpenAI-compatible server",
  chatgpt: "ChatGPT",
};

export function defaultProviderConfig(provider: SummaryProvider): ProviderConfig {
  const urls: Record<SummaryProvider, string> = {
    local: "",
    lm_studio: "http://127.0.0.1:1234/v1",
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    openai_compatible: "http://127.0.0.1:1234/v1",
    chatgpt: "",
  };
  return {
    provider,
    base_url: urls[provider],
    model: provider === "local" ? "qwen3-4b-q4.gguf" : "",
    allow_remote: false,
  };
}

export const DEMO_PROVIDER_STATUS: ProviderStatus = {
  config: defaultProviderConfig("local"),
  has_api_key: false,
  credential_storage: "none",
  uses_network: false,
  sends_transcript_off_device: false,
};

function isLoopback(url: URL): boolean {
  return url.hostname === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(url.hostname);
}

export function sendsTextOffDevice(config: ProviderConfig): boolean {
  if (config.provider === "local") return false;
  if (["openai", "anthropic", "chatgpt"].includes(config.provider)) return true;
  try {
    return !isLoopback(new URL(config.base_url));
  } catch {
    return true;
  }
}

/** Early feedback only. Rust independently validates every saved/requested URL. */
export function validateProviderConfig(config: ProviderConfig): string | null {
  if (config.provider === "local") return null;
  if (config.provider !== "chatgpt") {
    let url: URL;
    try {
      url = new URL(config.base_url);
    } catch {
      return "Enter a complete API base URL, including http:// or https://.";
    }
    if (url.username || url.password || url.search || url.hash) {
      return "Keep credentials, query parameters, and fragments out of the API base URL.";
    }
    if (!(["http:", "https:"].includes(url.protocol))) {
      return "Use an HTTP or HTTPS API base URL.";
    }
    if (url.hostname === "localhost") {
      return "Use 127.0.0.1 or [::1] instead of localhost for a server on this computer.";
    }
    if (config.provider === "lm_studio" && (!isLoopback(url) || url.protocol !== "http:")) {
      return "LM Studio must use an HTTP address on 127.0.0.1 or [::1]. Use a custom server for another computer.";
    }
    if (!isLoopback(url) && url.protocol !== "https:") {
      return "Remote servers require HTTPS to protect your notes and API key.";
    }
  }
  if (!config.model.trim()) return "Enter the model ID your provider serves.";
  if (sendsTextOffDevice(config) && !config.allow_remote) {
    return "Allow text to be sent to this provider before saving, or choose a local model.";
  }
  return null;
}

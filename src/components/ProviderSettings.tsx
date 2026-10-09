import { useI18n } from "../i18n";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Cpu,
  KeyRound,
  Loader2,
  Mic,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBackend } from "../lib/backend";
import {
  defaultProviderConfig,
  DEMO_PROVIDER_STATUS,
  PROVIDER_LABELS,
  sendsTextOffDevice,
  validateProviderConfig,
} from "../lib/provider-types";
import type {
  ChatgptAuthStatus,
  ChatgptModel,
  ProviderConfig,
  ProviderStatus,
  SummaryProvider,
} from "../lib/provider-types";

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60";

function errorMessage(error: unknown, secret = ""): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "The connection could not be updated. Please try again.";
  return secret ? message.replaceAll(secret, "[redacted]") : message;
}

export function ProviderSettings({ onSaved }: { onSaved?: () => void }) {
  const { t } = useI18n();
  const backend = getBackend();
  const demo = backend.mode === "demo";
  const [saved, setSaved] = useState<ProviderStatus | null>(
    demo ? DEMO_PROVIDER_STATUS : null,
  );
  const [draft, setDraft] = useState<ProviderConfig>(
    defaultProviderConfig("local"),
  );
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [loading, setLoading] = useState(!demo);
  const [busy, setBusy] = useState<"save" | "test" | "auth" | "models" | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [testPassed, setTestPassed] = useState(false);
  const [auth, setAuth] = useState<ChatgptAuthStatus | null>(null);
  const [accountId, setAccountId] = useState("");
  const [modelCatalog, setModelCatalog] = useState<{
    accountId: string | null;
    models: ChatgptModel[];
  } | null>(null);
  const catalogRequest = useRef(0);
  const activeAccount = auth?.accounts.find(
    (account) => account.id === auth.active_account_id,
  );
  const hasChatgptCredentials = !!auth && auth.credential_storage !== "none";
  const activeAccountSelected =
    hasChatgptCredentials && accountId === auth?.active_account_id;
  const accountModels =
    hasChatgptCredentials &&
    modelCatalog &&
    modelCatalog.accountId === auth?.active_account_id
      ? modelCatalog.models
      : null;
  const remote = sendsTextOffDevice(draft);
  const local = draft.provider === "local";
  const chatgpt = draft.provider === "chatgpt";
  const dirty =
    !saved ||
    JSON.stringify(draft) !== JSON.stringify(saved.config) ||
    apiKey.length > 0 ||
    clearApiKey;
  const disabled = loading || busy !== null;
  const savedCredential =
    saved?.config.provider === draft.provider &&
    saved.config.base_url === draft.base_url &&
    saved.has_api_key;

  useEffect(
    () => () => {
      catalogRequest.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (demo) return;
    let active = true;
    backend.getProviderSettings().then(
      (value) => {
        if (!active) return;
        setSaved(value);
        setDraft(value.config);
        setLoading(false);
      },
      (reason) => {
        if (!active) return;
        setError(errorMessage(reason));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [backend, demo]);

  useEffect(() => {
    if (demo || !chatgpt) return;
    let active = true;
    backend.chatgptAuthStatus().then(
      (value) => {
        if (active) {
          setAuth(value);
          setAccountId(value.active_account_id ?? "");
          setModelCatalog((current) =>
            value.credential_storage === "none" ||
            current?.accountId !== value.active_account_id
              ? null
              : current,
          );
        }
      },
      (reason) => {
        if (active) setError(errorMessage(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [backend, chatgpt, demo]);

  useEffect(() => {
    if (demo || auth?.state !== "pending") return;
    let active = true;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const value = await backend.chatgptAuthStatus();
        if (active) {
          setAuth(value);
          setModelCatalog((current) =>
            value.credential_storage === "none" ||
            current?.accountId !== value.active_account_id
              ? null
              : current,
          );
          if (value.state === "signed_in") {
            setAccountId(value.active_account_id ?? "");
          }
        }
      } catch (reason) {
        if (active) {
          setAuth((current) => ({
            credential_storage: "none",
            accounts: [],
            active_account_id: null,
            ...current,
            state: "error",
            detail: "Could not check sign-in status.",
          }));
          setError(errorMessage(reason));
        }
      } finally {
        pending = false;
      }
    }, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [auth?.state, backend, demo]);

  const resetFeedback = () => {
    setError("");
    setNotice("");
    setTestPassed(false);
  };

  const selectProvider = (provider: SummaryProvider) => {
    resetFeedback();
    setApiKey("");
    setClearApiKey(false);
    setModelCatalog(null);
    catalogRequest.current += 1;
    setDraft(
      saved?.config.provider === provider
        ? { ...saved.config }
        : defaultProviderConfig(provider),
    );
  };

  const save = async () => {
    resetFeedback();
    const config = {
      ...draft,
      base_url: draft.base_url.trim(),
      model: draft.model.trim(),
      allow_remote: remote && draft.allow_remote,
    };
    const invalid = validateProviderConfig(config);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("save");
    try {
      const value = await backend.saveProviderSettings({
        config,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(clearApiKey ? { clearApiKey: true } : {}),
      });
      setSaved(value);
      setDraft(value.config);
      setApiKey("");
      setClearApiKey(false);
      setNotice(
        t("Settings saved. Test the connection before your next meeting."),
      );
      onSaved?.();
    } catch (reason) {
      setError(errorMessage(reason, apiKey.trim()));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    resetFeedback();
    setBusy("test");
    try {
      const result = await backend.testProviderConnection();
      if (!result.ok) setError(result.message);
      else {
        setTestPassed(true);
        setNotice(result.message);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const manageAuth = async (action: "start" | "cancel" | "disconnect") => {
    resetFeedback();
    if (action === "start" && !draft.allow_remote) {
      setError(
        t("Allow text to be sent to ChatGPT before connecting your account."),
      );
      return;
    }
    setModelCatalog(null);
    catalogRequest.current += 1;
    setBusy("auth");
    try {
      if (action === "start")
        await backend.startChatgptSignIn({
          allowRemote: draft.allow_remote,
          accountId: accountId || null,
        });
      else if (action === "cancel") await backend.cancelChatgptSignIn();
      else await backend.disconnectChatgpt();
      const value = await backend.chatgptAuthStatus();
      setAuth(value);
      if (value.state !== "pending")
        setAccountId(value.active_account_id ?? "");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  };

  const loadModels = async () => {
    if (
      demo ||
      disabled ||
      !chatgpt ||
      !draft.allow_remote ||
      !activeAccountSelected ||
      auth?.state === "pending"
    )
      return;
    resetFeedback();
    setModelCatalog(null);
    setBusy("models");
    const request = ++catalogRequest.current;
    const selectedAccount = auth?.active_account_id ?? null;
    try {
      const models = await backend.chatgptModels();
      if (request !== catalogRequest.current) return;
      setModelCatalog({ accountId: selectedAccount, models });
      if (!models.length)
        setNotice(
          t(
            "No models were returned for this account. Enter an exact model ID and test the connection.",
          ),
        );
    } catch (reason) {
      if (request === catalogRequest.current) setError(errorMessage(reason));
    } finally {
      if (request === catalogRequest.current) setBusy(null);
    }
  };

  return (
    <section
      className="surface-card overflow-hidden"
      aria-labelledby="providers-title"
      aria-busy={disabled}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-5 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
          <Cpu size={18} />
        </span>
        <div>
          <h2 id="providers-title" className="text-sm font-semibold">
            {t("Models & connections")}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(
              "Keep speech local. Choose what turns your transcript into notes.",
            )}
          </p>
        </div>
      </div>
      <div className="space-y-6 p-5 sm:p-6">
        <div className="rounded-xl border border-border bg-secondary/35 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              <Mic size={15} className="text-primary" />
              {t("Transcription · local Whisper")}
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
              {t("Audio stays on device")}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t(
              "Microphone audio becomes a transcript on this computer. Whisper is required for recording with every summary provider.",
            )}
          </p>
        </div>
        <label
          className="block text-xs font-semibold"
          htmlFor="summary-provider"
        >
          {t("Summary & assistant provider")}
          <select
            id="summary-provider"
            className={inputClass}
            value={draft.provider}
            disabled={disabled}
            onChange={(event) =>
              selectProvider(event.target.value as SummaryProvider)
            }
          >
            {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <div
          className={`rounded-xl border p-4 ${remote ? "border-amber-600/20 bg-amber-500/5" : "border-primary/20 bg-primary/5"}`}
        >
          <div className="flex items-start gap-2.5">
            {remote ? (
              <Cloud
                size={17}
                className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
              />
            ) : (
              <ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary" />
            )}
            <div>
              <p className="text-xs font-semibold">
                {remote
                  ? t("Text leaves this device")
                  : local
                    ? t("Audio and text stay on this device")
                    : t("Text goes to a server on this device")}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {remote
                  ? t(
                      "Transcripts, prompts, and relevant saved notes are sent to your selected provider when you generate notes or use the assistant. Raw audio stays here. The provider’s data policies apply.",
                    )
                  : local
                    ? t(
                        "The built-in Qwen model creates notes and answers questions without a provider connection. Install its model file to get started.",
                      )
                    : t(
                        "OpenGranola sends text to the loopback address below. Check the server’s own configuration and data policies if it connects to other services.",
                      )}
              </p>
            </div>
          </div>
          <div
            className="mt-3 flex flex-wrap items-center gap-2 border-t border-current/10 pt-3 text-[10px] font-medium text-muted-foreground"
            aria-label={t("Processing route")}
          >
            <span>{t("Local Whisper")}</span>
            <ArrowRight size={12} />
            <span>{t(PROVIDER_LABELS[draft.provider])}</span>
            <ArrowRight size={12} />
            <span>{t("Local notes")}</span>
          </div>
        </div>
        {!local && (
          <div className="space-y-4">
            {!chatgpt && (
              <div>
                <label
                  className="block text-xs font-semibold"
                  htmlFor="provider-base-url"
                >
                  {t("API base URL")}
                </label>
                <input
                  id="provider-base-url"
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                  value={draft.base_url}
                  disabled={
                    disabled || ["openai", "anthropic"].includes(draft.provider)
                  }
                  onChange={(event) => {
                    resetFeedback();
                    setApiKey("");
                    setClearApiKey(false);
                    setDraft({
                      ...draft,
                      base_url: event.target.value,
                      allow_remote: false,
                    });
                  }}
                  aria-describedby="endpoint-help"
                />
                <span
                  id="endpoint-help"
                  className="mt-2 block text-[11px] font-normal leading-relaxed text-muted-foreground"
                >
                  {draft.provider === "lm_studio"
                    ? t(
                        "Start LM Studio’s local server and use its /v1 base URL. Load a text model before testing.",
                      )
                    : draft.provider === "openai_compatible"
                      ? t(
                          "Use the server’s API base, usually ending in /v1. Other computers require HTTPS and permission to send text.",
                        )
                      : t(
                          "This provider uses its official API endpoint. Use a custom server for another endpoint.",
                        )}
                </span>
              </div>
            )}
            <label
              className="block text-xs font-semibold"
              htmlFor="provider-model"
            >
              {t("Model ID")}
              <input
                id="provider-model"
                autoComplete="off"
                spellCheck={false}
                className={inputClass}
                value={draft.model}
                disabled={disabled}
                placeholder={
                  draft.provider === "lm_studio"
                    ? t("Exact model ID shown in LM Studio")
                    : t("Exact model ID from your provider")
                }
                onChange={(event) => {
                  resetFeedback();
                  setDraft({ ...draft, model: event.target.value });
                }}
              />
            </label>
            {!chatgpt && (
              <div>
                <label
                  className="block text-xs font-semibold"
                  htmlFor="provider-api-key"
                >
                  {t("API key")}
                  {["lm_studio", "openai_compatible"].includes(draft.provider)
                    ? t(" (if required)")
                    : ""}
                  <input
                    id="provider-api-key"
                    type="password"
                    autoComplete="new-password"
                    spellCheck={false}
                    className={inputClass}
                    value={apiKey}
                    disabled={demo || disabled || clearApiKey}
                    placeholder={
                      demo
                        ? t("Enter keys in the desktop app")
                        : savedCredential
                          ? t("Saved key · leave blank to keep")
                          : t("Enter a key, or leave blank to use a saved key")
                    }
                    onChange={(event) => {
                      resetFeedback();
                      setApiKey(event.target.value);
                    }}
                    aria-describedby="credential-help"
                  />
                </label>
                <p
                  id="credential-help"
                  className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
                >
                  <KeyRound size={12} className="mt-0.5 shrink-0" />
                  {demo
                    ? t("This preview does not accept or save credentials.")
                    : savedCredential && saved?.credential_storage === "session"
                      ? t(
                          "Your key is kept for this app session only. Enter it again after restarting.",
                        )
                      : savedCredential &&
                          saved?.credential_storage === "os_keychain"
                        ? t(
                            "Your key is saved in the operating system’s credential store. It is never returned to this form.",
                          )
                        : t(
                            "Keys are passed to the desktop app, never saved in browser storage. Changing the endpoint uses a separate credential.",
                          )}
                </p>
                {savedCredential && (
                  <label className="mt-3 flex min-h-10 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={clearApiKey}
                      disabled={demo || disabled}
                      onChange={(event) => {
                        resetFeedback();
                        setApiKey("");
                        setClearApiKey(event.target.checked);
                      }}
                    />
                    {t("Remove the saved API key when saving")}
                  </label>
                )}
              </div>
            )}
            {remote && (
              <label className="flex items-start gap-3 rounded-xl border border-amber-600/20 p-4 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={draft.allow_remote}
                  disabled={disabled}
                  onChange={(event) => {
                    resetFeedback();
                    if (!event.target.checked) setModelCatalog(null);
                    setDraft({ ...draft, allow_remote: event.target.checked });
                  }}
                />
                <span>
                  {t(
                    "I allow transcripts, prompts, and relevant saved notes to be sent to this provider for summaries and assistant requests.",
                  )}
                </span>
              </label>
            )}
            {chatgpt && (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold">
                  {t("Connect your ChatGPT account")}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "Sign in in your browser to use eligible model requests from your ChatGPT plan. This connection handles text; Whisper still transcribes your audio locally.",
                  )}
                </p>
                <p role="status" className="mt-2 text-xs text-muted-foreground">
                  {demo
                    ? t("Sign-in is available in the desktop app.")
                    : auth?.detail
                      ? t(auth.detail)
                      : t("Checking sign-in status…")}
                </p>
                {activeAccount && hasChatgptCredentials && (
                  <p className="mt-2 text-xs font-medium">
                    {t("Active account:")} {activeAccount.label}
                  </p>
                )}
                {hasChatgptCredentials &&
                  auth?.credential_storage === "session" && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {t(
                        "Connected for this app session only. Sign in again after restarting.",
                      )}
                    </p>
                  )}
                {!!auth?.accounts?.length && (
                  <label
                    className="mt-3 block text-xs font-semibold"
                    htmlFor="chatgpt-account"
                  >
                    {t("Account for sign-in")}
                    <select
                      id="chatgpt-account"
                      className={inputClass}
                      value={accountId}
                      disabled={demo || disabled || auth.state === "pending"}
                      onChange={(event) => {
                        setAccountId(event.target.value);
                        setModelCatalog(null);
                        catalogRequest.current += 1;
                      }}
                    >
                      <option value="">{t("Add an account")}</option>
                      {auth.accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={demo || disabled || !auth}
                    onClick={() =>
                      void manageAuth(
                        auth?.state === "pending" ? "cancel" : "start",
                      )
                    }
                  >
                    {busy === "auth" && (
                      <Loader2 size={13} className="animate-spin" />
                    )}
                    {auth?.state === "pending"
                      ? t("Cancel sign-in")
                      : t("Continue with ChatGPT")}
                  </button>
                  {hasChatgptCredentials && auth?.state !== "pending" && (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={demo || disabled}
                      onClick={() => void manageAuth("disconnect")}
                    >
                      {t("Disconnect ChatGPT")}
                    </button>
                  )}
                </div>
                {hasChatgptCredentials && (
                  <div className="mt-4 border-t border-border pt-4">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={
                        demo ||
                        disabled ||
                        !draft.allow_remote ||
                        !activeAccountSelected ||
                        auth?.state === "pending"
                      }
                      onClick={() => void loadModels()}
                    >
                      {busy === "models" && (
                        <Loader2 size={13} className="animate-spin" />
                      )}
                      {busy === "models"
                        ? t("Loading models…")
                        : t("Load available models")}
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {!activeAccountSelected
                        ? t(
                            "Connect the selected account before loading its models.",
                          )
                        : !draft.allow_remote
                          ? t(
                              "Allow remote processing above to load models for the active account.",
                            )
                          : t(
                              "Fetches the model list for your active account without sending meeting content. Save your choice and test it; a listed model may not support this workflow.",
                            )}
                    </p>
                    {!!accountModels?.length && (
                      <label
                        htmlFor="chatgpt-model-choice"
                        className="mt-3 block text-xs font-semibold"
                      >
                        {t("Available account models")}
                        <select
                          id="chatgpt-model-choice"
                          className={inputClass}
                          value={
                            accountModels.some(
                              (model) => model.id === draft.model,
                            )
                              ? draft.model
                              : ""
                          }
                          disabled={disabled}
                          onChange={(event) => {
                            if (!event.target.value) return;
                            resetFeedback();
                            setDraft({ ...draft, model: event.target.value });
                          }}
                        >
                          <option value="">
                            {t("Choose a model to fill Model ID")}
                          </option>
                          {accountModels.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label === model.id
                                ? model.id
                                : `${model.label} · ${model.id}`}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-relaxed text-destructive dark:text-red-400"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {t(error)}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-xs leading-relaxed"
          >
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" />
            {t(notice)}
          </p>
        )}
        <div className="border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="button-primary"
              disabled={demo || disabled || !dirty}
              onClick={() => void save()}
            >
              {busy === "save" && (
                <Loader2 size={14} className="animate-spin" />
              )}
              {busy === "save" ? t("Saving…") : t("Save model settings")}
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={demo || disabled || dirty || !saved}
              onClick={() => void test()}
            >
              {busy === "test" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : testPassed ? (
                <CheckCircle2 size={14} />
              ) : (
                <Plug size={14} />
              )}
              {busy === "test" ? t("Testing…") : t("Test connection")}
            </button>
            {loading && (
              <span className="text-xs text-muted-foreground">
                {t("Loading settings…")}
              </span>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            {demo
              ? t(
                  "Explore these settings here, then connect a model in the desktop app. Nothing in this form is saved by the browser demo.",
                )
              : dirty
                ? t(
                    "Save your changes before testing. The test sends a short sample prompt with no meeting content. Provider usage charges may apply.",
                  )
                : t(
                    "The test sends a short sample prompt with no meeting content. It checks one response; long meeting quality and speed can differ. Provider usage charges may apply.",
                  )}
          </p>
        </div>
      </div>
    </section>
  );
}

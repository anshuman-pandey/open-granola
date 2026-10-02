//! Native-only model transport. Settings contain no secrets; credentials are
//! scoped to the selected provider and exact API base URL in the OS keychain.
//! Local inference never falls back to a network provider.

use anyhow::{bail, Context, Result};
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::llm::Completion;

const OPENAI_BASE: &str = "https://api.openai.com/v1";
const ANTHROPIC_BASE: &str = "https://api.anthropic.com/v1";
const MAX_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_PROMPT_BYTES: usize = 1024 * 1024;
const KEYCHAIN_SERVICE: &str = "app.opengranola.model-providers";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Provider {
    Local,
    LmStudio,
    Openai,
    Anthropic,
    OpenaiCompatible,
    Chatgpt,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderConfig {
    pub provider: Provider,
    pub base_url: String,
    pub model: String,
    pub allow_remote: bool,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            provider: Provider::Local,
            base_url: String::new(),
            model: "qwen3-4b-q4.gguf".into(),
            allow_remote: false,
        }
    }
}

impl ProviderConfig {
    pub fn validated(mut self) -> Result<Self> {
        if self.provider == Provider::Local {
            return Ok(Self::default());
        }
        self.model = self.model.trim().to_owned();
        if self.model.is_empty()
            || self.model.len() > 200
            || self.model.chars().any(char::is_control)
        {
            bail!("Enter a model identifier of 1 to 200 characters");
        }
        if self.base_url.len() > 2000 {
            bail!("The API base URL is too long");
        }
        let default = match self.provider {
            Provider::Openai | Provider::Chatgpt => OPENAI_BASE,
            Provider::Anthropic => ANTHROPIC_BASE,
            Provider::LmStudio => "http://127.0.0.1:1234/v1",
            _ => "",
        };
        let supplied = if self.base_url.trim().is_empty() {
            default
        } else {
            self.base_url.trim()
        };
        let url =
            Url::parse(supplied).map_err(|_| anyhow::anyhow!("Enter an absolute API base URL"))?;
        if !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            bail!("API URLs cannot contain credentials, query parameters, or fragments");
        }
        if url.host().is_none() || !matches!(url.scheme(), "http" | "https") {
            bail!("The API URL must use HTTP or HTTPS and include a host");
        }
        self.base_url = url.as_str().trim_end_matches('/').to_owned();
        match self.provider {
            Provider::Openai | Provider::Chatgpt if self.base_url != OPENAI_BASE => {
                bail!("OpenAI and ChatGPT use the fixed https://api.openai.com/v1 endpoint");
            }
            Provider::Anthropic if self.base_url != ANTHROPIC_BASE => {
                bail!("Claude uses the fixed https://api.anthropic.com/v1 endpoint");
            }
            Provider::LmStudio if !literal_loopback(&url) || url.scheme() != "http" => {
                bail!("LM Studio requires a literal loopback HTTP URL, such as http://127.0.0.1:1234/v1");
            }
            Provider::OpenaiCompatible if url.scheme() != "https" && !literal_loopback(&url) => {
                bail!("Remote API endpoints require HTTPS; HTTP is allowed only for literal loopback addresses");
            }
            _ => {}
        }
        if !literal_loopback(&url) && !self.allow_remote {
            bail!(
                "Allow sending transcript text off this device before selecting a cloud provider"
            );
        }
        Ok(self)
    }

    pub fn sends_transcript_off_device(&self) -> bool {
        self.provider != Provider::Local
            && Url::parse(&self.base_url)
                .map(|url| !literal_loopback(&url))
                .unwrap_or(true)
    }

    fn credential_scope(&self) -> String {
        format!("{:?}:{}", self.provider, self.base_url)
    }

    fn accepts_key(&self) -> bool {
        !matches!(self.provider, Provider::Local | Provider::Chatgpt)
    }
}

fn literal_loopback(url: &Url) -> bool {
    url.host_str()
        .and_then(|host| {
            host.trim_matches(['[', ']'])
                .parse::<std::net::IpAddr>()
                .ok()
        })
        .is_some_and(|ip| ip.is_loopback())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialStorage {
    OsKeychain,
    Session,
    None,
}

#[derive(Debug, Serialize)]
pub struct ProviderStatus {
    pub config: ProviderConfig,
    pub has_api_key: bool,
    pub credential_storage: CredentialStorage,
    pub uses_network: bool,
    pub sends_transcript_off_device: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedSettings {
    version: u8,
    config: ProviderConfig,
    // If a keychain write fails, a stale keychain entry must never silently
    // become active again after restart. Only the new session key is usable.
    #[serde(default)]
    session_only_scopes: HashSet<String>,
}

trait CredentialStore: Send + Sync {
    fn get(&self, scope: &str) -> Result<Option<String>>;
    fn set(&self, scope: &str, key: &str) -> Result<()>;
    fn delete(&self, scope: &str) -> Result<()>;
}

struct OsKeychain;
impl CredentialStore for OsKeychain {
    fn get(&self, scope: &str) -> Result<Option<String>> {
        match keyring::Entry::new(KEYCHAIN_SERVICE, scope)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => bail!(
                "The OS credential store is unavailable; unlock it or enter a key for this session"
            ),
        }
    }
    fn set(&self, scope: &str, key: &str) -> Result<()> {
        keyring::Entry::new(KEYCHAIN_SERVICE, scope)?.set_password(key)?;
        Ok(())
    }
    fn delete(&self, scope: &str) -> Result<()> {
        match keyring::Entry::new(KEYCHAIN_SERVICE, scope)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => {
                bail!("Could not remove the key from the OS credential store; unlock it and retry")
            }
        }
    }
}

pub struct ProviderManager {
    data_dir: PathBuf,
    saved: SavedSettings,
    session_keys: HashMap<String, String>,
    credentials: Box<dyn CredentialStore>,
    #[cfg(test)]
    settings_writes_before_failure: Option<usize>,
}

impl ProviderManager {
    pub fn load(data_dir: &Path) -> Result<Self> {
        Self::load_with_credentials(data_dir, Box::new(OsKeychain))
    }

    fn load_with_credentials(
        data_dir: &Path,
        credentials: Box<dyn CredentialStore>,
    ) -> Result<Self> {
        let file = data_dir.join("providers.json");
        let saved = match fs::read(&file) {
            Ok(bytes) => {
                if bytes.len() > 128 * 1024 {
                    bail!("Provider settings file is too large");
                }
                let mut parsed: SavedSettings = serde_json::from_slice(&bytes).context(
                    "Provider settings are invalid; repair or remove library/providers.json",
                )?;
                if parsed.version != 1 {
                    bail!("Unsupported provider settings version");
                }
                parsed.config = parsed.config.validated()?;
                parsed
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => SavedSettings {
                version: 1,
                config: ProviderConfig::default(),
                session_only_scopes: HashSet::new(),
            },
            Err(_) => bail!("Could not read provider settings"),
        };
        Ok(Self {
            data_dir: data_dir.to_owned(),
            saved,
            session_keys: HashMap::new(),
            credentials,
            #[cfg(test)]
            settings_writes_before_failure: None,
        })
    }

    pub fn config(&self) -> &ProviderConfig {
        &self.saved.config
    }

    pub fn status(&self) -> ProviderStatus {
        let scope = self.saved.config.credential_scope();
        let accepts = self.saved.config.accepts_key();
        let in_session = accepts && self.session_keys.contains_key(&scope);
        let in_keychain = accepts
            && !in_session
            && !self.saved.session_only_scopes.contains(&scope)
            && matches!(self.credentials.get(&scope), Ok(Some(_)));
        ProviderStatus {
            config: self.saved.config.clone(),
            has_api_key: in_session || in_keychain,
            credential_storage: if in_session {
                CredentialStorage::Session
            } else if in_keychain {
                CredentialStorage::OsKeychain
            } else {
                CredentialStorage::None
            },
            uses_network: self.saved.config.provider != Provider::Local,
            sends_transcript_off_device: self.saved.config.sends_transcript_off_device(),
        }
    }

    pub fn save(
        &mut self,
        config: ProviderConfig,
        api_key: Option<String>,
        clear_api_key: bool,
    ) -> Result<ProviderStatus> {
        let config = config.validated()?;
        let key = api_key
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_owned());
        if key.is_some() && clear_api_key {
            bail!("Choose either a new API key or removing the saved key");
        }
        if key.is_some() && !config.accepts_key() {
            bail!("This provider does not accept an API key");
        }
        if let Some(key) = &key {
            if key.len() > 4096
                || !key.is_ascii()
                || key.chars().any(|c| c.is_control() || c.is_whitespace())
            {
                bail!("The API key must be at most 4096 bytes and contain no whitespace");
            }
        }
        let scope = config.credential_scope();
        let mut next = self.saved.clone();
        next.config = config;
        if clear_api_key && next.config.accepts_key() {
            // Do not claim deletion succeeded while a persistent key survives.
            self.credentials.delete(&scope)?;
            self.session_keys.remove(&scope);
            next.session_only_scopes.remove(&scope);
        }
        if let Some(key) = key {
            // Persist disabling before touching a durable credential. If this
            // write fails, neither the active route nor either key changes.
            // A crash or later write failure cannot resurrect the previous key.
            next.session_only_scopes.insert(scope.clone());
            self.persist(&next)?;
            self.saved = next.clone();
            self.session_keys.insert(scope.clone(), key.clone());
            if self.credentials.set(&scope, &key).is_ok() {
                next.session_only_scopes.remove(&scope);
                if self.persist(&next).is_ok() {
                    self.saved = next;
                    self.session_keys.remove(&scope);
                }
            }
            // Failed keychain writes or re-enable writes remain explicitly
            // session-only. The already persisted marker is authoritative.
            return Ok(self.status());
        }
        self.persist(&next)?;
        self.saved = next;
        Ok(self.status())
    }

    fn persist(&mut self, settings: &SavedSettings) -> Result<()> {
        #[cfg(test)]
        if let Some(remaining) = self.settings_writes_before_failure.as_mut() {
            if *remaining == 0 {
                bail!("Injected provider settings write failure");
            }
            *remaining -= 1;
        }
        write_settings(&self.data_dir, settings)
    }

    fn api_key(&self) -> Result<Option<String>> {
        let scope = self.saved.config.credential_scope();
        if let Some(value) = self.session_keys.get(&scope) {
            return Ok(Some(value.clone()));
        }
        if self.saved.session_only_scopes.contains(&scope) {
            return Ok(None);
        }
        self.credentials.get(&scope)
    }
}

impl Completion for ProviderManager {
    fn complete(&self, system: &str, user: &str, max_tokens: usize) -> Result<String> {
        // Validate again at the point of use: corrupt settings and hidden IPC
        // calls cannot bypass endpoint or off-device consent checks.
        let config = self.saved.config.clone().validated()?;
        if system.len().saturating_add(user.len()) > MAX_PROMPT_BYTES {
            bail!("This request exceeds the 1 MB text limit; choose a smaller set of notes");
        }
        match config.provider {
            Provider::Local => bail!(
                "Local inference must use the embedded model; no network fallback was attempted"
            ),
            Provider::Chatgpt => {
                crate::auth::complete(&self.data_dir, system, user, &config.model, max_tokens)
            }
            _ => {
                let key = self.api_key()?;
                if matches!(config.provider, Provider::Openai | Provider::Anthropic)
                    && key.is_none()
                {
                    bail!("Add an API key for the selected provider in Settings");
                }
                remote_completion(&config, key.as_deref(), system, user, max_tokens)
            }
        }
    }
}

fn write_settings(data_dir: &Path, settings: &SavedSettings) -> Result<()> {
    fs::create_dir_all(data_dir).context("Could not create provider settings directory")?;
    let temporary = data_dir.join(format!(".providers-{}.tmp", uuid::Uuid::new_v4()));
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(settings)?)?;
        file.sync_all()?;
        fs::rename(&temporary, data_dir.join("providers.json"))?;
        Ok::<_, anyhow::Error>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result.context("Could not save provider settings")
}

fn remote_completion(
    config: &ProviderConfig,
    key: Option<&str>,
    system: &str,
    user: &str,
    max_tokens: usize,
) -> Result<String> {
    let config = config.clone().validated()?;
    let (path, body) = request_payload(&config, system, user, max_tokens)?;
    let client = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| anyhow::anyhow!("Could not initialize the provider connection"))?;
    let mut request = client
        .post(format!("{}{path}", config.base_url))
        .json(&body);
    if config.provider == Provider::Anthropic {
        request = request.header("anthropic-version", "2023-06-01");
        if let Some(key) = key {
            let mut header = reqwest::header::HeaderValue::from_str(key)
                .map_err(|_| anyhow::anyhow!("The saved API key has an invalid format"))?;
            header.set_sensitive(true);
            request = request.header("x-api-key", header);
        }
    } else if let Some(key) = key {
        request = request.bearer_auth(key);
    }
    let response = request.send().map_err(|error| {
        // reqwest's Display can contain URLs. Provider response bodies may echo
        // prompts or keys, so neither is included in errors or logs.
        anyhow::anyhow!(if error.is_timeout() {
            "The provider timed out; your saved transcript is unchanged"
        } else if error.is_connect() {
            "Could not connect to the provider; check its server, URL, and network access"
        } else {
            "The provider request failed; check the selected model and connection settings"
        })
    })?;
    let status = response.status();
    if !status.is_success() {
        bail!("{}", match status.as_u16() {
            300..=399 => "The provider returned a redirect, which was blocked. Enter the final API URL in Settings.",
            401 | 403 => "The provider rejected the credentials or account access. Check the selected provider and API key.",
            404 => "The provider could not find this endpoint or model. Check the API base URL and model identifier.",
            429 => "The provider rate limit or account quota was reached. Retry later or check the provider account.",
            400..=499 => "The provider rejected the request. Check that the selected model supports this API.",
            _ => "The provider is unavailable. Your saved transcript is unchanged; try again later.",
        });
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_RESPONSE_BYTES)
    {
        bail!("The provider response exceeded the 2 MB limit");
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| anyhow::anyhow!("Could not read the provider response"))?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        bail!("The provider response exceeded the 2 MB limit");
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| anyhow::anyhow!("The provider returned invalid JSON"))?;
    parse_response(config.provider, &value)
}

fn request_payload(
    config: &ProviderConfig,
    system: &str,
    user: &str,
    max_tokens: usize,
) -> Result<(&'static str, Value)> {
    let max_tokens = max_tokens.clamp(64, 8192);
    match config.provider {
        Provider::Openai => Ok((
            "/responses",
            json!({
                "model":config.model, "instructions":system, "input":user,
                "max_output_tokens":max_tokens.saturating_mul(4).min(8192), "store":false, "stream":false
            }),
        )),
        Provider::Anthropic => Ok((
            "/messages",
            json!({
                "model":config.model, "system":system, "messages":[{"role":"user","content":user}],
                "max_tokens":max_tokens, "stream":false
            }),
        )),
        Provider::LmStudio | Provider::OpenaiCompatible => Ok((
            "/chat/completions",
            json!({
                "model":config.model, "messages":[{"role":"system","content":system},{"role":"user","content":user}],
                "max_tokens":max_tokens, "stream":false
            }),
        )),
        _ => bail!("This provider does not use an API-key HTTP transport"),
    }
}

fn parse_response(provider: Provider, value: &Value) -> Result<String> {
    let mut text = String::new();
    match provider {
        Provider::Openai => {
            if value.get("error").is_some_and(|error| !error.is_null())
                || value["status"] != "completed"
            {
                bail!(
                    "The provider did not complete the response; retry with a shorter transcript"
                );
            }
            if let Some(output) = value["output"].as_array() {
                for item in output {
                    if item["type"] != "message" {
                        continue;
                    }
                    if let Some(content) = item["content"].as_array() {
                        for block in content {
                            if block["type"] == "refusal" {
                                bail!("The provider declined this request");
                            }
                            if block["type"] == "output_text" {
                                if let Some(part) = block["text"].as_str() {
                                    text.push_str(part);
                                }
                            }
                        }
                    }
                }
            }
        }
        Provider::Anthropic => {
            if value["type"] != "message" || value["stop_reason"] != "end_turn" {
                bail!(
                    "The provider did not finish a text response; retry with a shorter transcript"
                );
            }
            if let Some(content) = value["content"].as_array() {
                for block in content {
                    if block["type"] == "text" {
                        if let Some(part) = block["text"].as_str() {
                            text.push_str(part);
                        }
                    }
                }
            }
        }
        Provider::LmStudio | Provider::OpenaiCompatible => {
            let choice = &value["choices"][0];
            if let Some(reason) = choice["finish_reason"].as_str() {
                if reason != "stop" {
                    bail!("The provider did not finish a text response; retry with a shorter transcript");
                }
            }
            if choice["message"]["refusal"]
                .as_str()
                .is_some_and(|s| !s.is_empty())
            {
                bail!("The provider declined this request");
            }
            if let Some(content) = choice["message"]["content"].as_str() {
                text.push_str(content);
            }
        }
        _ => bail!("No response parser exists for this provider"),
    }
    if text.trim().is_empty() {
        bail!("The provider returned no usable text");
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::NoteModel;
    use std::net::TcpListener;
    use std::sync::{mpsc, Arc, Mutex};

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir()
                .join(format!("opengranola-providers-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[derive(Clone, Default)]
    struct TestCredentials {
        keys: Arc<Mutex<HashMap<String, String>>>,
        fail_writes: bool,
    }
    impl CredentialStore for TestCredentials {
        fn get(&self, scope: &str) -> Result<Option<String>> {
            Ok(self.keys.lock().unwrap().get(scope).cloned())
        }
        fn set(&self, scope: &str, key: &str) -> Result<()> {
            if self.fail_writes {
                bail!("locked test keychain");
            }
            self.keys
                .lock()
                .unwrap()
                .insert(scope.to_owned(), key.to_owned());
            Ok(())
        }
        fn delete(&self, scope: &str) -> Result<()> {
            self.keys.lock().unwrap().remove(scope);
            Ok(())
        }
    }

    fn config(provider: Provider, url: &str, allow_remote: bool) -> ProviderConfig {
        ProviderConfig {
            provider,
            base_url: url.into(),
            model: "test-model".into(),
            allow_remote,
        }
    }

    fn mock_server(
        status: &str,
        extra_headers: &str,
        body: String,
    ) -> (String, mpsc::Receiver<String>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/v1", listener.local_addr().unwrap());
        let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{extra_headers}\r\n{body}", body.len());
        let (tx, rx) = mpsc::channel();
        let handle = std::thread::spawn(move || {
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error)
                        if error.kind() == std::io::ErrorKind::WouldBlock
                            && std::time::Instant::now() < deadline =>
                    {
                        std::thread::sleep(Duration::from_millis(5))
                    }
                    Err(error) => panic!("mock server did not receive a request: {error}"),
                }
            };
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..count]);
                if let Some(header_end) = request.windows(4).position(|w| w == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&request[..header_end]).to_lowercase();
                    let content_length = header
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length:")
                                .and_then(|s| s.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
                assert!(request.len() < 2 * 1024 * 1024);
            }
            tx.send(String::from_utf8(request).unwrap()).unwrap();
            let _ = stream.write_all(response.as_bytes());
        });
        (endpoint, rx, handle)
    }

    fn chat_response(text: &str) -> String {
        json!({"choices":[{"message":{"content":text},"finish_reason":"stop"}]}).to_string()
    }

    #[test]
    fn local_is_the_default_and_never_calls_remote_transport() {
        let dir = TestDirectory::new();
        let manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(TestCredentials::default()))
                .unwrap();
        assert_eq!(manager.config(), &ProviderConfig::default());
        assert!(!manager.status().uses_network);
        assert!(manager
            .complete("private", "meeting words", 100)
            .unwrap_err()
            .to_string()
            .contains("no network fallback"));
        assert!(request_payload(manager.config(), "private", "words", 100).is_err());
    }

    #[test]
    fn loopback_and_cloud_policy_is_enforced() {
        for url in ["http://127.0.0.1:1234/v1", "http://[::1]:1234/v1"] {
            let local = config(Provider::LmStudio, url, false).validated().unwrap();
            assert!(!local.sends_transcript_off_device());
        }
        for url in [
            "http://localhost:1234/v1",
            "http://192.168.1.5/v1",
            "https://example.com/v1",
            "http://127.0.0.1.evil.test/v1",
            "http://user:password@127.0.0.1/v1",
            "http://127.0.0.1/v1?key=secret",
            "http://127.0.0.1/v1#fragment",
        ] {
            assert!(
                config(Provider::LmStudio, url, true).validated().is_err(),
                "{url}"
            );
        }
        assert!(config(Provider::Openai, OPENAI_BASE, false)
            .validated()
            .is_err());
        assert!(config(Provider::Chatgpt, OPENAI_BASE, false)
            .validated()
            .is_err());
        assert!(
            config(Provider::OpenaiCompatible, "http://example.com/v1", true)
                .validated()
                .is_err()
        );
        assert!(
            config(Provider::OpenaiCompatible, "https://example.com/v1", false)
                .validated()
                .is_err()
        );
        assert!(
            config(Provider::OpenaiCompatible, "https://example.com/v1", true)
                .validated()
                .is_ok()
        );
        assert!(config(Provider::Openai, "https://evil.test/v1", true)
            .validated()
            .is_err());
        assert!(config(
            Provider::Anthropic,
            "https://api.anthropic.com.evil.test/v1",
            true
        )
        .validated()
        .is_err());
    }

    #[test]
    fn invalid_models_and_unknown_secret_fields_are_rejected() {
        let mut invalid = config(Provider::LmStudio, "", false);
        invalid.model = "   ".into();
        assert!(invalid.validated().is_err());
        assert!(serde_json::from_value::<ProviderConfig>(json!({"provider":"openai","model":"m","base_url":OPENAI_BASE,"allow_remote":true,"api_key":"secret"})).is_err());
    }

    #[test]
    fn keychain_credentials_never_reach_disk_or_renderer_and_are_endpoint_scoped() {
        let dir = TestDirectory::new();
        let store = TestCredentials::default();
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(store.clone())).unwrap();
        let first = config(Provider::OpenaiCompatible, "https://one.example/v1", true);
        let result = manager
            .save(first.clone(), Some("secret-api-token".into()), false)
            .unwrap();
        assert!(result.has_api_key);
        assert!(matches!(
            result.credential_storage,
            CredentialStorage::OsKeychain
        ));
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("secret-api-token"));
        assert!(!fs::read_to_string(dir.0.join("providers.json"))
            .unwrap()
            .contains("secret-api-token"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(dir.0.join("providers.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        let switched = manager
            .save(
                config(Provider::OpenaiCompatible, "https://two.example/v1", true),
                None,
                false,
            )
            .unwrap();
        assert!(!switched.has_api_key);
        assert!(manager.api_key().unwrap().is_none());
        assert!(
            manager
                .save(first.clone(), None, false)
                .unwrap()
                .has_api_key
        );
        manager.save(first, None, true).unwrap();
        assert!(store.keys.lock().unwrap().is_empty());
    }

    #[test]
    fn session_fallback_does_not_resurrect_stale_keychain_keys_after_restart() {
        let dir = TestDirectory::new();
        let selected = config(Provider::Openai, OPENAI_BASE, true);
        let store = TestCredentials {
            fail_writes: true,
            ..TestCredentials::default()
        };
        store
            .keys
            .lock()
            .unwrap()
            .insert(selected.credential_scope(), "stale-key".into());
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(store.clone())).unwrap();
        let result = manager
            .save(selected, Some("new-session-key".into()), false)
            .unwrap();
        assert!(matches!(
            result.credential_storage,
            CredentialStorage::Session
        ));
        assert_eq!(
            manager.api_key().unwrap().as_deref(),
            Some("new-session-key")
        );
        let disk = fs::read_to_string(dir.0.join("providers.json")).unwrap();
        assert!(!disk.contains("new-session-key") && !disk.contains("stale-key"));
        let reloaded = ProviderManager::load_with_credentials(&dir.0, Box::new(store)).unwrap();
        assert!(reloaded.api_key().unwrap().is_none());
        assert!(!reloaded.status().has_api_key);
    }

    #[test]
    fn failed_disable_write_leaves_the_previous_credential_and_route_unchanged() {
        let dir = TestDirectory::new();
        let store = TestCredentials::default();
        let selected = config(Provider::Openai, OPENAI_BASE, true);
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(store.clone())).unwrap();
        manager
            .save(selected.clone(), Some("previous-key".into()), false)
            .unwrap();
        let before = fs::read(dir.0.join("providers.json")).unwrap();
        manager.settings_writes_before_failure = Some(0);
        assert!(manager
            .save(selected.clone(), Some("replacement-key".into()), false)
            .is_err());
        assert_eq!(fs::read(dir.0.join("providers.json")).unwrap(), before);
        assert_eq!(manager.config(), &selected);
        assert_eq!(manager.api_key().unwrap().as_deref(), Some("previous-key"));
        assert_eq!(
            store.get(&selected.credential_scope()).unwrap().as_deref(),
            Some("previous-key")
        );
    }

    #[test]
    fn failed_reenable_write_keeps_new_key_session_only_and_disabled_after_restart() {
        let dir = TestDirectory::new();
        let store = TestCredentials::default();
        let selected = config(Provider::Openai, OPENAI_BASE, true);
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(store.clone())).unwrap();
        manager
            .save(selected.clone(), Some("previous-key".into()), false)
            .unwrap();
        manager.settings_writes_before_failure = Some(1);
        let status = manager
            .save(selected.clone(), Some("replacement-key".into()), false)
            .unwrap();
        assert!(matches!(
            status.credential_storage,
            CredentialStorage::Session
        ));
        assert_eq!(
            manager.api_key().unwrap().as_deref(),
            Some("replacement-key")
        );
        let saved: SavedSettings =
            serde_json::from_slice(&fs::read(dir.0.join("providers.json")).unwrap()).unwrap();
        assert!(saved
            .session_only_scopes
            .contains(&selected.credential_scope()));
        let reloaded = ProviderManager::load_with_credentials(&dir.0, Box::new(store)).unwrap();
        assert!(reloaded.api_key().unwrap().is_none());
        assert!(!reloaded.status().has_api_key);
    }

    #[test]
    fn corrupt_settings_are_not_silently_replaced() {
        let dir = TestDirectory::new();
        fs::write(dir.0.join("providers.json"), "{broken").unwrap();
        assert!(ProviderManager::load_with_credentials(
            &dir.0,
            Box::new(TestCredentials::default())
        )
        .is_err());
        assert_eq!(
            fs::read_to_string(dir.0.join("providers.json")).unwrap(),
            "{broken"
        );
    }

    #[test]
    fn official_api_payloads_are_stateless_and_use_correct_roles() {
        let (path, body) = request_payload(
            &config(Provider::Openai, OPENAI_BASE, true),
            "system",
            "transcript",
            1200,
        )
        .unwrap();
        assert_eq!(path, "/responses");
        assert_eq!(body["store"], false);
        assert_eq!(body["input"], "transcript");
        assert_eq!(body["instructions"], "system");
        assert!(body.get("previous_response_id").is_none());
        let (path, body) = request_payload(
            &config(Provider::Anthropic, ANTHROPIC_BASE, true),
            "system",
            "transcript",
            1200,
        )
        .unwrap();
        assert_eq!(path, "/messages");
        assert_eq!(body["system"], "system");
        assert_eq!(body["messages"][0]["role"], "user");
    }

    #[test]
    fn parsers_reject_partial_refused_missing_and_nontext_output() {
        assert_eq!(parse_response(Provider::Openai, &json!({"status":"completed","output":[{"type":"reasoning"},{"type":"message","content":[{"type":"output_text","text":"notes"}]}]})).unwrap(), "notes");
        assert_eq!(parse_response(Provider::Anthropic, &json!({"type":"message","stop_reason":"end_turn","content":[{"type":"thinking","thinking":"hidden"},{"type":"text","text":"notes"}]})).unwrap(), "notes");
        for value in [
            json!({}),
            json!({"status":"incomplete","output":[{"type":"message","content":[{"type":"output_text","text":"partial"}]}]}),
            json!({"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"no"}]}]}),
        ] {
            assert!(parse_response(Provider::Openai, &value).is_err());
        }
        for value in [
            json!({}),
            json!({"choices":[{"finish_reason":"length","message":{"content":"partial"}}]}),
            json!({"choices":[{"finish_reason":"stop","message":{"content":""}}]}),
        ] {
            assert!(parse_response(Provider::LmStudio, &value).is_err());
        }
        assert!(parse_response(Provider::Anthropic, &json!({"type":"message","stop_reason":"max_tokens","content":[{"type":"text","text":"partial"}]})).is_err());
    }

    #[test]
    fn synthetic_connection_test_uses_only_saved_provider_and_no_meeting_text() {
        let (url, request, server) = mock_server("200 OK", "", chat_response("Hello"));
        let dir = TestDirectory::new();
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(TestCredentials::default()))
                .unwrap();
        manager
            .save(
                config(Provider::LmStudio, &url, false),
                Some("local-token".into()),
                false,
            )
            .unwrap();
        NoteModel::new(&manager).test_connection().unwrap();
        let request = request.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer local-token"));
        let body: Value = serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["model"], "test-model");
        assert!(body["messages"][1]["content"]
            .as_str()
            .unwrap()
            .contains("synthetic test text"));
        server.join().unwrap();
    }

    #[test]
    fn redirect_cannot_forward_transcript_or_credentials() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let headers = format!(
            "Location: http://{}/stolen\r\n",
            target.local_addr().unwrap()
        );
        let (url, request, server) = mock_server("307 Temporary Redirect", &headers, String::new());
        let error = remote_completion(
            &config(Provider::LmStudio, &url, false),
            Some("secret-token"),
            "system",
            "private transcript",
            100,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("redirect"));
        assert!(!error.contains("secret-token") && !error.contains("private transcript"));
        request.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();
        assert_eq!(
            target.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }

    #[test]
    fn provider_errors_never_echo_response_bodies_and_invalid_json_is_rejected() {
        for (status, body, expected) in [
            (
                "401 Unauthorized",
                "secret-api-key private-transcript",
                "credentials",
            ),
            ("200 OK", "not JSON: private-transcript", "invalid JSON"),
        ] {
            let (url, request, server) = mock_server(status, "", body.into());
            let error = remote_completion(
                &config(Provider::LmStudio, &url, false),
                None,
                "system",
                "user",
                100,
            )
            .unwrap_err()
            .to_string();
            assert!(error.contains(expected));
            assert!(!error.contains("private-transcript") && !error.contains("secret-api-key"));
            request.recv_timeout(Duration::from_secs(5)).unwrap();
            server.join().unwrap();
        }
    }

    #[test]
    fn oversized_provider_responses_are_rejected() {
        let (url, request, server) =
            mock_server("200 OK", "", "x".repeat(MAX_RESPONSE_BYTES as usize + 1));
        let error = remote_completion(
            &config(Provider::LmStudio, &url, false),
            None,
            "system",
            "user",
            100,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("2 MB"));
        request.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();
    }

    #[test]
    fn consent_and_size_checks_run_before_any_network_request() {
        let target = TcpListener::bind("127.0.0.1:0").unwrap();
        target.set_nonblocking(true).unwrap();
        let dir = TestDirectory::new();
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(TestCredentials::default()))
                .unwrap();
        // Simulate invalid in-memory configuration to exercise the point-of-use
        // guard independently of settings-save validation.
        manager.saved.config = config(Provider::OpenaiCompatible, "https://example.com/v1", false);
        assert!(manager
            .complete("s", "private", 100)
            .unwrap_err()
            .to_string()
            .contains("off this device"));
        manager.saved.config = config(
            Provider::LmStudio,
            &format!("http://{}/v1", target.local_addr().unwrap()),
            false,
        );
        assert!(manager
            .complete("s", &"x".repeat(MAX_PROMPT_BYTES + 1), 100)
            .unwrap_err()
            .to_string()
            .contains("1 MB"));
        assert_eq!(
            target.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }

    #[test]
    fn malformed_structured_note_preserves_explicit_failure() {
        let (url, request, server) = mock_server(
            "200 OK",
            "",
            chat_response("{\"title\":\"Missing fields\"}"),
        );
        let dir = TestDirectory::new();
        let mut manager =
            ProviderManager::load_with_credentials(&dir.0, Box::new(TestCredentials::default()))
                .unwrap();
        manager
            .save(config(Provider::LmStudio, &url, false), None, false)
            .unwrap();
        assert!(NoteModel::new(&manager)
            .enhance(&[], "Meeting")
            .unwrap_err()
            .to_string()
            .contains("invalid JSON"));
        request.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();
    }
}

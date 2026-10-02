//! Sign in with ChatGPT for OSS apps. All tokens stay in the native process or
//! OS credential store. The webview receives account labels and status only.
use anyhow::{bail, ensure, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use parking_lot::Mutex;
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ISSUER: &str = "https://auth.openai.com";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const RESOURCE: &str = "https://api.openai.com/v1";
const SERVICE: &str = "app.opengranola.chatgpt";
const SCOPES: &str =
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const MAX_JSON: u64 = 1024 * 1024;
type Shared = Arc<Mutex<AuthStore>>;
static STORES: OnceLock<Mutex<HashMap<PathBuf, Shared>>> = OnceLock::new();

#[derive(Clone, Serialize, Deserialize)]
struct Registration {
    id: String,
    client_id: String,
    subject: String,
    label: String,
    // A durable marker prevents a failed keychain delete/write from resurrecting
    // stale credentials on restart. No secrets are written to this file.
    #[serde(default)]
    credential_enabled: bool,
}
#[derive(Serialize, Deserialize)]
struct Registry {
    host_id: String,
    #[serde(default)]
    pending_client: Option<String>,
    active: Option<String>,
    accounts: Vec<Registration>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    access_token: String,
    refresh_token: String,
    id_token: String,
    scopes: String,
    expires_at: u64,
}
struct AuthStore {
    path: PathBuf,
    registry: Registry,
    session: HashMap<String, Credentials>,
    pending: Option<String>,
    error: Option<String>,
    detail: Option<String>,
}
#[derive(Serialize)]
pub struct AccountLabel {
    id: String,
    label: String,
}
#[derive(Serialize)]
pub struct AuthStatus {
    state: &'static str,
    detail: String,
    credential_storage: &'static str,
    accounts: Vec<AccountLabel>,
    active_account_id: Option<String>,
}
#[derive(Deserialize)]
struct Tokens {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    id_token: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    token_type: String,
    expires_in: u64,
}
#[derive(Clone, Deserialize)]
struct Claims {
    sub: String,
    nonce: Option<String>,
    email: Option<String>,
}
struct Attempt {
    id: String,
    state: String,
    nonce: String,
    verifier: String,
    redirect: String,
    registration: Option<Registration>,
    client_id: String,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn random() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn client() -> Result<Client> {
    Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .context("Could not initialize ChatGPT connection")
}
fn json_response(response: reqwest::blocking::Response) -> Result<Value> {
    ensure!(
        response.status().is_success(),
        "ChatGPT request failed (HTTP {}). Reconnect or check your plan permissions.",
        response.status().as_u16()
    );
    let mut bytes = Vec::new();
    response
        .take(MAX_JSON + 1)
        .read_to_end(&mut bytes)
        .context("Could not read ChatGPT response")?;
    ensure!(
        bytes.len() as u64 <= MAX_JSON,
        "ChatGPT response exceeded the size limit"
    );
    serde_json::from_slice(&bytes).context("ChatGPT returned an invalid response")
}
fn checked_auth_url(value: &str) -> Result<Url> {
    let url = Url::parse(value).context("Invalid OpenAI authentication endpoint")?;
    ensure!(
        url.scheme() == "https"
            && url.host_str() == Some("auth.openai.com")
            && url.port_or_known_default() == Some(443)
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
            && url.query().is_none(),
        "Unexpected OpenAI authentication endpoint"
    );
    Ok(url)
}
fn discovery(client: &Client) -> Result<Value> {
    json_response(
        client
            .get(format!("{ISSUER}/.well-known/openid-configuration"))
            .send()
            .map_err(|_| anyhow::anyhow!("Could not reach OpenAI authentication"))?,
    )
}
fn validate_id(
    client: &Client,
    token: &str,
    client_id: &str,
    nonce: Option<&str>,
) -> Result<Claims> {
    let config = discovery(client)?;
    ensure!(
        config["issuer"].as_str() == Some(ISSUER),
        "Unexpected identity issuer"
    );
    let jwks_url = checked_auth_url(
        config["jwks_uri"]
            .as_str()
            .context("OpenAI did not provide signing keys")?,
    )?;
    let jwks: jsonwebtoken::jwk::JwkSet = serde_json::from_value(json_response(
        client
            .get(jwks_url)
            .send()
            .map_err(|_| anyhow::anyhow!("Could not fetch OpenAI signing keys"))?,
    )?)?;
    verify_claims(token, client_id, nonce, &jwks)
}
fn verify_claims(
    token: &str,
    client_id: &str,
    nonce: Option<&str>,
    jwks: &jsonwebtoken::jwk::JwkSet,
) -> Result<Claims> {
    let header = jsonwebtoken::decode_header(token).context("Invalid ChatGPT identity token")?;
    ensure!(
        header.alg == jsonwebtoken::Algorithm::RS256,
        "Unsupported identity signing algorithm"
    );
    let key = jwks
        .find(
            header
                .kid
                .as_deref()
                .context("Identity signing key is missing")?,
        )
        .context("Identity signing key was not found")?;
    let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::RS256);
    validation.set_audience(&[client_id]);
    validation.set_issuer(&[ISSUER]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    let claims = jsonwebtoken::decode::<Claims>(
        token,
        &jsonwebtoken::DecodingKey::from_jwk(key)?,
        &validation,
    )
    .map_err(|_| anyhow::anyhow!("ChatGPT identity verification failed"))?
    .claims;
    ensure!(
        !claims.sub.is_empty(),
        "ChatGPT account identity is missing"
    );
    if let Some(expected) = nonce {
        ensure!(
            claims.nonce.as_deref().is_some_and(|v| equal(v, expected)),
            "ChatGPT sign-in nonce did not match"
        );
    }
    Ok(claims)
}
fn equal(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |diff, (x, y)| diff | (x ^ y))
            == 0
}
fn scopes_allowed(scopes: &str) -> bool {
    ["resource.invoke", "chatgpt.tokens.use.direct"]
        .iter()
        .all(|needed| scopes.split_whitespace().any(|scope| scope == *needed))
}
fn entry(account: &Registration) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, &account.id)?)
}
impl AuthStore {
    fn save(&self) -> Result<()> {
        let parent = self.path.parent().context("Missing account directory")?;
        fs::create_dir_all(parent)?;
        let temp = parent.join(format!(".chatgpt-{}.tmp", uuid::Uuid::new_v4()));
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| -> Result<()> {
            let mut file = options.open(&temp)?;
            file.write_all(&serde_json::to_vec_pretty(&self.registry)?)?;
            file.sync_all()?;
            fs::rename(&temp, &self.path)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(temp);
        }
        result.context("Could not save ChatGPT account settings")
    }
    fn credentials(&self, account: &Registration) -> Option<(Credentials, &'static str)> {
        if let Some(value) = self.session.get(&account.id) {
            return Some((value.clone(), "session"));
        }
        if !account.credential_enabled {
            return None;
        }
        let value = entry(account).ok()?.get_password().ok()?;
        Some((serde_json::from_str(&value).ok()?, "os_keychain"))
    }
    fn store_credentials(&mut self, id: &str, credentials: Credentials) -> Result<()> {
        let index = self
            .registry
            .accounts
            .iter()
            .position(|a| a.id == id)
            .context("Account not found")?;
        // Disable the old durable record before attempting an update.
        self.registry.accounts[index].credential_enabled = false;
        self.save()?;
        let account = &self.registry.accounts[index];
        let saved = entry(account)
            .and_then(|e| Ok(e.set_password(&serde_json::to_string(&credentials)?)?))
            .is_ok();
        if saved {
            self.registry.accounts[index].credential_enabled = true;
            if self.save().is_ok() {
                self.session.remove(id);
                return Ok(());
            }
            self.registry.accounts[index].credential_enabled = false;
        }
        self.session.insert(id.to_owned(), credentials);
        Ok(())
    }
}
fn store(data_dir: &Path) -> Result<Shared> {
    let stores = STORES.get_or_init(Default::default);
    let mut all = stores.lock();
    if let Some(store) = all.get(data_dir) {
        return Ok(store.clone());
    }
    let path = data_dir.join("chatgpt-accounts.json");
    let registry = if path.exists() {
        ensure!(
            fs::metadata(&path)?.len() <= MAX_JSON,
            "ChatGPT account settings are too large"
        );
        serde_json::from_slice::<Registry>(&fs::read(&path)?)
            .context("Invalid ChatGPT account settings")?
    } else {
        Registry {
            host_id: format!("urn:uuid:{}", uuid::Uuid::new_v4()),
            active: None,
            pending_client: None,
            accounts: vec![],
        }
    };
    let runtime = AuthStore {
        path,
        registry,
        session: HashMap::new(),
        pending: None,
        error: None,
        detail: None,
    };
    runtime.save()?;
    let shared = Arc::new(Mutex::new(runtime));
    all.insert(data_dir.to_path_buf(), shared.clone());
    Ok(shared)
}
fn status(data_dir: &Path) -> Result<AuthStatus> {
    let shared = store(data_dir)?;
    let store = shared.lock();
    let active = store
        .registry
        .active
        .as_ref()
        .and_then(|id| store.registry.accounts.iter().find(|a| &a.id == id));
    let credential = active.and_then(|a| store.credentials(a));
    let state = if store.pending.is_some() {
        "pending"
    } else if store.error.is_some() {
        "error"
    } else if credential.is_some() {
        "signed_in"
    } else {
        "signed_out"
    };
    let detail = store
        .error
        .clone()
        .or_else(|| store.detail.clone())
        .unwrap_or_else(|| match state {
            "pending" => {
                "Complete authorization in your browser. This request expires after five minutes."
                    .into()
            }
            "signed_in" => format!(
                "Connected: {}. Uses your ChatGPT plan allowance.",
                active.map(|a| a.label.as_str()).unwrap_or("ChatGPT")
            ),
            _ => "Connect your ChatGPT account to summarize using your plan allowance.".into(),
        });
    Ok(AuthStatus {
        state,
        detail,
        credential_storage: credential.map(|(_, storage)| storage).unwrap_or("none"),
        accounts: store
            .registry
            .accounts
            .iter()
            .map(|a| AccountLabel {
                id: a.id.clone(),
                label: a.label.clone(),
            })
            .collect(),
        active_account_id: store.registry.active.clone(),
    })
}
fn callback(query: &str, attempt: &Attempt) -> Result<(String, String)> {
    let mut params = HashMap::new();
    for (key, value) in
        reqwest::Url::parse(&format!("http://127.0.0.1/auth/callback?{query}"))?.query_pairs()
    {
        ensure!(
            params
                .insert(key.into_owned(), value.into_owned())
                .is_none(),
            "Duplicate sign-in callback parameter"
        );
    }
    ensure!(
        params
            .get("state")
            .is_some_and(|s| equal(s, &attempt.state)),
        "Sign-in state did not match"
    );
    ensure!(
        !params.contains_key("error"),
        "ChatGPT sign-in was declined or could not be completed"
    );
    let code = params
        .remove("code")
        .filter(|v| !v.is_empty() && v.len() <= 4096)
        .context("Sign-in code is missing")?;
    let client_id = if attempt.client_id != "dynamic_agent_client" {
        ensure!(
            params
                .get("client_id")
                .is_none_or(|v| v == &attempt.client_id),
            "Sign-in returned a different account registration"
        );
        attempt.client_id.clone()
    } else {
        params
            .remove("client_id")
            .filter(|id| {
                id.starts_with("oaiapp_")
                    && id.len() < 256
                    && id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            })
            .context("ChatGPT registration did not return an issued client ID")?
    };
    Ok((code, client_id))
}
fn exchange(attempt: &Attempt, query: &str) -> Result<(String, Claims, Credentials)> {
    let (code, client_id) = callback(query, attempt)?;
    let http = client()?;
    let response = http
        .post(TOKEN)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", &client_id),
            ("code", &code),
            ("code_verifier", &attempt.verifier),
            ("redirect_uri", &attempt.redirect),
            ("resource", RESOURCE),
        ])
        .send()
        .map_err(|_| {
            anyhow::anyhow!("Could not exchange ChatGPT authorization. Try signing in again.")
        })?;
    let tokens: Tokens = serde_json::from_value(json_response(response)?)
        .context("Incomplete ChatGPT token response")?;
    let cleanup_token = tokens.refresh_token.clone();
    let result = (|| -> Result<(String, Claims, Credentials)> {
        ensure!(
            tokens.token_type.eq_ignore_ascii_case("bearer"),
            "Unexpected ChatGPT token type"
        );
        let scopes = tokens
            .scope
            .context("ChatGPT did not return granted permissions")?;
        ensure!(
            scopes_allowed(&scopes),
            "ChatGPT plan usage was not enabled. Authorize plan access and try again."
        );
        let id_token = tokens
            .id_token
            .context("ChatGPT identity token is missing")?;
        let claims = validate_id(&http, &id_token, &client_id, Some(&attempt.nonce))?;
        if let Some(account) = &attempt.registration {
            ensure!(
                account.subject == claims.sub,
                "Sign-in returned a different ChatGPT account"
            );
        }
        ensure!(
            !tokens.access_token.is_empty() && tokens.expires_in > 0,
            "ChatGPT access credentials are missing"
        );
        Ok((
            client_id.clone(),
            claims,
            Credentials {
                access_token: tokens.access_token,
                refresh_token: tokens
                    .refresh_token
                    .filter(|v| !v.is_empty())
                    .context("ChatGPT did not grant renewable access")?,
                id_token,
                scopes,
                expires_at: now().saturating_add(tokens.expires_in),
            },
        ))
    })();
    if result.is_err() {
        if let Some(token) = cleanup_token {
            let _ = revoke_remote(&client_id, &token);
        }
    }
    result
}

fn request_target(stream: &mut TcpStream) -> Result<String> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    let mut bytes = Vec::new();
    let mut byte = [0u8; 1];
    while bytes.len() < 8192 {
        if stream.read(&mut byte)? == 0 {
            break;
        }
        bytes.push(byte[0]);
        if bytes.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    ensure!(bytes.ends_with(b"\r\n\r\n"), "Invalid callback request");
    let request = std::str::from_utf8(&bytes)?;
    let mut parts = request
        .lines()
        .next()
        .context("Empty callback")?
        .split_whitespace();
    ensure!(parts.next() == Some("GET"), "Invalid callback method");
    let target = parts.next().context("Missing callback target")?;
    ensure!(
        target.starts_with("/auth/callback?"),
        "Unexpected callback path"
    );
    Ok(target.trim_start_matches("/auth/callback?").to_owned())
}
fn respond(stream: &mut TcpStream, ok: bool) {
    let body = if ok {
        "ChatGPT connected. You can close this tab and return to OpenGranola."
    } else {
        "Sign-in could not be completed. Return to OpenGranola for details."
    };
    let _ = write!(stream,"HTTP/1.1 {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Security-Policy: default-src 'none'\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",if ok {"200 OK"} else {"400 Bad Request"},body.len(),body);
}
fn listen(shared: Shared, listener: TcpListener, attempt: Attempt) {
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
        if shared.lock().pending.as_deref() != Some(&attempt.id) {
            return;
        }
        match listener.accept() {
            Ok((mut stream, address)) if address.ip().is_loopback() => {
                let query = match request_target(&mut stream) {
                    Ok(q) => q,
                    Err(_) => {
                        respond(&mut stream, false);
                        continue;
                    }
                };
                // Ignore unrelated browser probes or forged callbacks; they must
                // not consume the user's pending authorization attempt.
                let state_matches = Url::parse(&format!("http://127.0.0.1/?{query}"))
                    .ok()
                    .is_some_and(|url| {
                        url.query_pairs()
                            .any(|(k, v)| k == "state" && equal(&v, &attempt.state))
                    });
                if !state_matches {
                    respond(&mut stream, false);
                    continue;
                }
                if attempt.registration.is_none() {
                    if let Ok((_, issued)) = callback(&query, &attempt) {
                        let mut store = shared.lock();
                        if store.pending.as_deref() != Some(&attempt.id) {
                            respond(&mut stream, false);
                            return;
                        }
                        store.registry.pending_client = Some(issued);
                        if store.save().is_err() {
                            store.pending = None;
                            store.error =
                                Some("Could not retain ChatGPT registration. Try again.".into());
                            respond(&mut stream, false);
                            return;
                        }
                    }
                }
                let result = exchange(&attempt, &query);
                let mut store = shared.lock();
                if store.pending.as_deref() != Some(&attempt.id) {
                    drop(store);
                    if let Ok((client_id, _, credentials)) = result {
                        let revoked = revoke_remote(&client_id, &credentials.refresh_token);
                        if !revoked {
                            shared.lock().detail=Some("Sign-in cancelled locally. Remote revocation was not confirmed; disconnect OpenGranola in ChatGPT Settings.".into());
                        }
                    }
                    respond(&mut stream, false);
                    return;
                }
                store.pending = None;
                match result {
                    Ok((client_id, claims, credentials)) => {
                        let id = attempt
                            .registration
                            .as_ref()
                            .map(|a| a.id.clone())
                            .or_else(|| {
                                store
                                    .registry
                                    .accounts
                                    .iter()
                                    .find(|a| a.client_id == client_id && a.subject == claims.sub)
                                    .map(|a| a.id.clone())
                            })
                            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
                        if !store.registry.accounts.iter().any(|a| a.id == id) {
                            let label = format!(
                                "{} · {}",
                                claims.email.unwrap_or_else(|| "ChatGPT account".into()),
                                &id[..8]
                            );
                            store.registry.accounts.push(Registration {
                                id: id.clone(),
                                client_id,
                                subject: claims.sub,
                                label,
                                credential_enabled: false,
                            });
                        }
                        match store.store_credentials(&id, credentials) {
                            Ok(()) => {
                                store.registry.active = Some(id);
                                store.registry.pending_client = None;
                                store.error = None;
                                store.detail = None;
                                if store.save().is_err() {
                                    store.detail=Some("Connected for this session; account selection could not be saved.".into());
                                }
                                respond(&mut stream, true);
                            }
                            Err(_) => {
                                store.error = Some(
                                    "Could not save ChatGPT account settings. Try again.".into(),
                                );
                                respond(&mut stream, false);
                            }
                        }
                    }
                    Err(error) => {
                        store.error = Some(error.to_string());
                        respond(&mut stream, false);
                    }
                }
                return;
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(_) => break,
        }
    }
    let mut store = shared.lock();
    if store.pending.as_deref() == Some(&attempt.id) {
        store.pending = None;
        store.error = Some("ChatGPT sign-in timed out. Start again when ready.".into());
    }
}
fn start(data_dir: &Path, allow_remote: bool, account_id: Option<String>) -> Result<()> {
    ensure!(
        allow_remote,
        "Allow remote processing before connecting ChatGPT"
    );
    let shared = store(data_dir)?;
    let mut store = shared.lock();
    ensure!(
        store.pending.is_none(),
        "A ChatGPT sign-in is already in progress"
    );
    let registration = match account_id {
        Some(id) => Some(
            store
                .registry
                .accounts
                .iter()
                .find(|a| a.id == id)
                .context("Saved ChatGPT account was not found")?
                .clone(),
        ),
        None => None,
    };
    let listener =
        TcpListener::bind("127.0.0.1:0").context("Could not start the local sign-in callback")?;
    listener.set_nonblocking(true)?;
    let client_id = registration
        .as_ref()
        .map(|a| a.client_id.clone())
        .or_else(|| store.registry.pending_client.clone())
        .unwrap_or_else(|| "dynamic_agent_client".into());
    let attempt = Attempt {
        client_id,
        id: random(),
        state: random(),
        nonce: random(),
        verifier: random(),
        redirect: format!(
            "http://127.0.0.1:{}/auth/callback",
            listener.local_addr()?.port()
        ),
        registration,
    };
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(attempt.verifier.as_bytes()));
    let mut url = Url::parse(AUTHORIZE)?;
    {
        let mut query = url.query_pairs_mut();
        query.extend_pairs([
            ("client_id", attempt.client_id.as_str()),
            ("ext_agent_host_id", &store.registry.host_id),
            ("response_type", "code"),
            ("redirect_uri", &attempt.redirect),
            ("scope", SCOPES),
            ("resource", RESOURCE),
            ("state", &attempt.state),
            ("nonce", &attempt.nonce),
            ("code_challenge_method", "S256"),
            ("code_challenge", &challenge),
        ]);
        if attempt.client_id == "dynamic_agent_client" {
            query.append_pair("agent_name_hint", "OpenGranola");
        }
        if let Some(account) = &attempt.registration {
            if let Some((creds, _)) = store.credentials(account) {
                query.append_pair("id_token_hint", &creds.id_token);
            }
        }
    }
    store.pending = Some(attempt.id.clone());
    store.error = None;
    store.detail = None;
    // Never return or log this URL: returning accounts can carry an ID-token hint.
    if webbrowser::open(url.as_str()).is_err() {
        store.pending = None;
        bail!("Could not open the browser for ChatGPT sign-in");
    }
    drop(store);
    std::thread::spawn(move || listen(shared, listener, attempt));
    Ok(())
}
fn refresh(http: &Client, account: &Registration, old: Credentials) -> Result<Credentials> {
    if old.expires_at > now() + 60 {
        ensure!(
            scopes_allowed(&old.scopes),
            "ChatGPT plan access is not enabled"
        );
        return Ok(old);
    }
    let response = http
        .post(TOKEN)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", account.client_id.as_str()),
            ("refresh_token", old.refresh_token.as_str()),
            ("resource", RESOURCE),
        ])
        .send()
        .map_err(|_| anyhow::anyhow!("Could not refresh ChatGPT access. Reconnect in Settings."))?;
    let tokens: Tokens = serde_json::from_value(json_response(response)?)
        .context("Invalid refreshed ChatGPT credentials")?;
    ensure!(
        tokens.token_type.eq_ignore_ascii_case("bearer")
            && !tokens.access_token.is_empty()
            && tokens.expires_in > 0,
        "Invalid refreshed ChatGPT access"
    );
    let scopes = tokens.scope.unwrap_or(old.scopes);
    ensure!(
        scopes_allowed(&scopes),
        "ChatGPT plan access is not enabled"
    );
    let id_token = if let Some(token) = tokens.id_token {
        let claims = validate_id(http, &token, &account.client_id, None)?;
        ensure!(
            claims.sub == account.subject,
            "ChatGPT refresh returned another identity"
        );
        token
    } else {
        old.id_token
    };
    Ok(Credentials {
        access_token: tokens.access_token,
        refresh_token: tokens
            .refresh_token
            .filter(|v| !v.is_empty())
            .context("ChatGPT did not rotate its refresh token. Reconnect in Settings.")?,
        id_token,
        scopes,
        expires_at: now().saturating_add(tokens.expires_in),
    })
}
fn parse_stream(reader: impl Read) -> Result<String> {
    let mut reader = BufReader::new(reader.take(8 * 1024 * 1024 + 1));
    let mut line = String::new();
    let mut data = String::new();
    let mut text = String::new();
    let mut bytes = 0usize;
    let mut completed = false;
    loop {
        line.clear();
        let size = reader
            .read_line(&mut line)
            .context("ChatGPT response was interrupted")?;
        if size == 0 {
            break;
        }
        bytes += size;
        ensure!(
            bytes <= 8 * 1024 * 1024,
            "ChatGPT response exceeded the size limit"
        );
        if line.trim().is_empty() {
            if data.trim() == "[DONE]" {
                break;
            }
            if !data.is_empty() {
                let value: Value =
                    serde_json::from_str(&data).context("Invalid ChatGPT stream event")?;
                match value["type"].as_str() {
                    Some("response.output_text.delta") => { text.push_str(value["delta"].as_str().context("Invalid ChatGPT text delta")?); },
                    Some("response.completed") => { ensure!(value["response"]["status"].as_str()==Some("completed"),"ChatGPT did not complete the response"); completed=true; },
                    Some("response.failed"|"response.incomplete"|"error") => bail!("ChatGPT did not complete the response. Your transcript is unchanged; retry when ready."),
                    _=>{},
                }
            }
            data.clear();
        } else if let Some(value) = line.strip_prefix("data:") {
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(value.trim_start().trim_end_matches(['\r', '\n']));
        }
    }
    ensure!(
        completed && !text.trim().is_empty(),
        "ChatGPT response ended before completion. Your transcript is unchanged; retry when ready."
    );
    Ok(text)
}
pub fn complete(
    data_dir: &Path,
    system: &str,
    user: &str,
    model: &str,
    _max_tokens: usize,
) -> Result<String> {
    ensure!(
        system.len() + user.len() <= 1024 * 1024,
        "The prompt is too large for this request"
    );
    let shared = store(data_dir)?;
    let mut store = shared.lock();
    let account = store
        .registry
        .active
        .as_ref()
        .and_then(|id| store.registry.accounts.iter().find(|a| &a.id == id))
        .cloned()
        .context("Connect ChatGPT in Settings first")?;
    let (old, _) = store
        .credentials(&account)
        .context("ChatGPT is signed out. Reconnect in Settings.")?;
    let http = client()?;
    let needs_refresh = old.expires_at <= now() + 60;
    let credentials = refresh(&http, &account, old)?;
    if needs_refresh {
        store.store_credentials(&account.id, credentials.clone())?;
    }
    // Keep the session lock through inference: disconnect cannot race an active
    // request or a rotating refresh. UI runs this blocking work off its thread.
    let response=http.post(format!("{RESOURCE}/responses"))
        .timeout(Duration::from_secs(120)).bearer_auth(&credentials.access_token)
        .json(&json!({"store":false,"stream":true,"model":model,"instructions":system,"input":[{"role":"user","content":user}]}))
        .send().map_err(|_|anyhow::anyhow!("Could not reach ChatGPT. Check connectivity and retry."))?;
    ensure!(
        response.status().is_success(),
        "ChatGPT request failed (HTTP {}). Check your model, plan limits, or reconnect.",
        response.status().as_u16()
    );
    parse_stream(response)
}
#[derive(Serialize)]
pub struct ModelChoice {
    id: String,
    label: String,
}
fn parse_models(value: Value) -> Result<Vec<ModelChoice>> {
    let models = value["models"]
        .as_array()
        .context("ChatGPT did not return its model catalog")?;
    let choices = models
        .iter()
        .filter(|model| model["visibility"].as_str() == Some("list"))
        .filter_map(|model| {
            let id = model["slug"].as_str()?;
            if id.trim().is_empty()
                || id.trim() != id
                || id.len() > 200
                || id.chars().any(char::is_control)
            {
                return None;
            }
            let label = model["display_name"]
                .as_str()
                .unwrap_or(id)
                .chars()
                .filter(|c| !c.is_control())
                .take(200)
                .collect();
            Some(ModelChoice {
                id: id.to_owned(),
                label,
            })
        })
        .collect::<Vec<_>>();
    ensure!(
        !choices.is_empty(),
        "No selectable models were returned for this ChatGPT account"
    );
    Ok(choices)
}
fn model_catalog(data_dir: &Path) -> Result<Vec<ModelChoice>> {
    let shared = store(data_dir)?;
    let mut store = shared.lock();
    let account = store
        .registry
        .active
        .as_ref()
        .and_then(|id| store.registry.accounts.iter().find(|a| &a.id == id))
        .cloned()
        .context("Connect ChatGPT first")?;
    let (old, _) = store
        .credentials(&account)
        .context("ChatGPT is signed out. Reconnect in Settings.")?;
    let http = client()?;
    let needs_refresh = old.expires_at <= now() + 60;
    let credentials = refresh(&http, &account, old)?;
    if needs_refresh {
        store.store_credentials(&account.id, credentials.clone())?;
    }
    let response = http
        .get(format!("{RESOURCE}/models"))
        .bearer_auth(&credentials.access_token)
        .send()
        .map_err(|_| anyhow::anyhow!("Could not fetch ChatGPT models"))?;
    parse_models(json_response(response)?)
}
#[tauri::command]
pub async fn list_chatgpt_models(
    state: tauri::State<'_, Arc<crate::AppState>>,
) -> Result<Vec<ModelChoice>, String> {
    let path = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || model_catalog(&path))
        .await
        .map_err(|_| "Model catalog worker failed".to_string())?
        .map_err(|e| e.to_string())
}

fn revoke_remote(client_id: &str, refresh_token: &str) -> bool {
    (|| -> Result<bool> {
        let http = client()?;
        let config = discovery(&http)?;
        let url = checked_auth_url(
            config["revocation_endpoint"]
                .as_str()
                .context("Missing revocation endpoint")?,
        )?;
        for attempt in 0..3 {
            let response = http
                .post(url.clone())
                .form(&[
                    ("token", refresh_token),
                    ("token_type_hint", "refresh_token"),
                    ("client_id", client_id),
                ])
                .timeout(Duration::from_secs(10))
                .send();
            match response {
                Ok(response) if response.status().as_u16() == 200 => return Ok(true),
                Ok(response) if !response.status().is_server_error() => return Ok(false),
                _ => {}
            }
            if attempt < 2 {
                std::thread::sleep(Duration::from_millis(200 * (1 << attempt)));
            }
        }
        Ok(false)
    })()
    .unwrap_or(false)
}

fn disconnect(data_dir: &Path) -> Result<()> {
    let shared = store(data_dir)?;
    let mut store = shared.lock();
    store.pending = None;
    store.error = None;
    let Some(account) = store
        .registry
        .active
        .as_ref()
        .and_then(|id| store.registry.accounts.iter().find(|a| &a.id == id))
        .cloned()
    else {
        return Ok(());
    };
    let credentials = store.credentials(&account);
    // Persist disabling first; even an unavailable keychain cannot reactivate it.
    if let Some(saved) = store
        .registry
        .accounts
        .iter_mut()
        .find(|a| a.id == account.id)
    {
        saved.credential_enabled = false;
    }
    store.save()?;
    let revoked = credentials.as_ref().is_none_or(|(credentials, _)| {
        revoke_remote(&account.client_id, &credentials.refresh_token)
    });
    store.session.remove(&account.id);
    let _ = entry(&account).and_then(|e| Ok(e.delete_credential()?));
    store.detail=Some(if revoked { "Signed out. Your saved account registration remains available." } else { "Signed out locally. Remote revocation was not confirmed; disconnect OpenGranola in ChatGPT Settings to end remote access." }.into());
    Ok(())
}

#[tauri::command]
pub async fn start_chatgpt_sign_in(
    state: tauri::State<'_, Arc<crate::AppState>>,
    allow_remote: bool,
    account_id: Option<String>,
) -> Result<(), String> {
    let path = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || start(&path, allow_remote, account_id))
        .await
        .map_err(|_| "Sign-in worker failed".to_string())?
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn get_chatgpt_auth_status(
    state: tauri::State<'_, Arc<crate::AppState>>,
) -> Result<AuthStatus, String> {
    let path = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || status(&path))
        .await
        .map_err(|_| "Account status worker failed".to_string())?
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn cancel_chatgpt_sign_in(
    state: tauri::State<'_, Arc<crate::AppState>>,
) -> Result<(), String> {
    let path = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let shared = store(&path).map_err(|e| e.to_string())?;
        let mut store = shared.lock();
        store.pending = None;
        store.error = None;
        store.detail = Some("Sign-in cancelled. If authorization already completed in your browser, review OpenGranola access in ChatGPT Settings.".into());
        Ok(())
    })
    .await
    .map_err(|_| "Cancel sign-in worker failed".to_string())?
}
#[tauri::command]
pub async fn disconnect_chatgpt(
    state: tauri::State<'_, Arc<crate::AppState>>,
) -> Result<(), String> {
    let path = state.data_dir.clone();
    tauri::async_runtime::spawn_blocking(move || disconnect(&path))
        .await
        .map_err(|_| "Sign-out worker failed".to_string())?
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_catalog_uses_account_slugs_visibility_and_server_order() {
        let models = parse_models(json!({"models":[
            {"slug":"first-model","display_name":"First choice","visibility":"list"},
            {"slug":"hidden-model","display_name":"Hidden choice","visibility":"hidden"},
            {"slug":"second-model","visibility":"list"},
            {"slug":"unlisted-model","display_name":"No visibility"},
            {"id":"api-shaped-entry","display_name":"Wrong shape","visibility":"list"}
        ]}))
        .unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "first-model");
        assert_eq!(models[0].label, "First choice");
        assert_eq!(models[1].id, "second-model");
        assert_eq!(models[1].label, "second-model");
    }

    #[test]
    fn model_catalog_rejects_empty_standard_api_shapes_and_invalid_identifiers() {
        for value in [
            json!({}),
            json!({"models":[]}),
            json!({"object":"list","data":[{"id":"api-model"}]}),
            json!({"models":[{"slug":"hidden","visibility":"hidden"}]}),
        ] {
            assert!(parse_models(value).is_err());
        }
        for id in [
            "".to_string(),
            " ".to_string(),
            " leading-space".to_string(),
            "trailing-space ".to_string(),
            "line\nbreak".to_string(),
            "x".repeat(201),
        ] {
            assert!(
                parse_models(json!({"models":[{"slug":id,"visibility":"list"}]})).is_err(),
                "invalid slug was accepted: {id:?}"
            );
        }
    }

    #[test]
    fn model_catalog_bounds_and_sanitizes_display_labels() {
        let models=parse_models(json!({"models":[{"slug":"valid-model","display_name":format!("A\n{}", "b".repeat(250)),"visibility":"list"}]})).unwrap();
        assert_eq!(models[0].label.chars().count(), 200);
        assert!(!models[0].label.chars().any(char::is_control));
    }

    // Generated solely for offline tests. This public fixture is never accepted
    // as an OpenAI signing key and contains no real account credentials.
    const TEST_RSA_PRIVATE_KEY: &str = r#"-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC/oJBFk6bgidp6
y5MfLz+qymd1VEnTZ1u2TSuE4YXDWe5hTHEIbrAkbO1E2hYUwPl9hBX7rMnp8Hxm
I885t+aVrJxGJpEs/ZnytHwvN2RSIIjMy2XIxVKddOhbplh3ofFygeg+gtaBxR44
BkXhshdP2SvBFONE109yUMb1JFcdK6RBqNZIrYmBamltNATEI4F5FzfsxSpY2gjv
Txj15oPHxzJbaOKbYYR8CsxNoDTc0D5hFd7es+Q1w7G14si6VUHtZyPH60jT+i3a
0IN0kmyctHJ9gPYN6Sb0kITS+F+simDYuOnXeuDjl2+jkTmRNqcXLnVe3rL23C0m
Sin6lo13AgMBAAECggEABeMLi5eloMWbY0+tuAozjS5P+gLE4dcNsjlcr5BeE5+c
+yWQs2RIdQCuVAHUe9QR1hFLZkKV/AyEmylZIboh6Kc3hdAu1ZBU570zs3T4LVhi
higZew7UzZGHMd7tCNUoyGPFRruuQKkAQf2vV+eotQNER4I6GSX5gtbdxdoqnZ1p
Uh50tDYuqJ05qOsGjZ4x95e9urhyUV0yFXbeEgBvz6Ly6yJRMaaCSANvm7sePqQJ
fpkI2epLdEa3zC1eAT6yJ+X+tsWU0ypzw6D4vCPVY7cfdpqhg4Rv0syhgmD2JP3k
cJEbajFT4hUPPHN7EbGovluMw26q8rj8U8uYfBEBAQKBgQDnFlpETLgAf8kNZxrP
1+jC6dcp0xHcu3HE4Jvp1UAL0XGCcLd1OS8jNOxJv3ckhKBSnvfP9uEWp3NEG8Lt
Ue3SxeAqtCjvkWhS+Bzjk4LzvCphNlspJwP7nuf1q7UW5UWf7NK205sJ6TnE/0Ft
aMiRkpcXrreD2uX0sdAiFOMQpwKBgQDUSSx5O1Z774Eyjc9bJ/sNKqrdTMsTZzet
2Vgzw5hWC683c1oTBliIzFN0FMPE2L6nRQRb1s8RjVwd5BBSQoIgqxF9uglvizkn
a8NYXOtWAo0N1k8m/d+ojLMzY/tVlZb3XnqLxY9ilNz9hcnsuqW4nB6ZJ7+iN5rK
qmYo1I7msQKBgC1nsfLLlDfc49czVAxUoxJxOeqo41CYsAD8FQZ79SqdS41Ssmlh
BAcJ5geTjEhrmsjBHXYKTy3RVw+h2Moil/UbFjGt1oFD89ihkaORn2Ber4EMWhsa
5GhzT6Zwx5MpF2YV9U0hBMyMu+IeOW/S793SjMeFd997ikVrDrcznW3vAoGAXt50
qZkDBU/7hQQq7qnnX/L5ePygpIM0NtUyva9jnNCL9VPvpSDo3/mwMeg1tPrH+Si2
0fQlhcqOqC0LvjdKwB6zKmTBYr/tQti96/dalI1/S/fCV8KM+V4nl4fPAmhflxz5
1wzrDztHp2Tq4IhpFx9t7TP+SBhhbMDJ9uVHF4ECgYARLwXPaLbN2VnjM7bEpGjr
1zZjlFfvyovJwX/HiD2EjPYJRRRgJC2a3y27svpD3ymD3UKMR2fJLAnln1n1gky+
HOn7ilG18Gsby1kp+aWz0/STnR/YquYoFgYsoNlkNGEpprzXwXT7ebP5Qvx1YmXt
p9RmBe8rxmcGpRRtm1iWlQ==
-----END PRIVATE KEY-----
"#;
    const TEST_RSA_MODULUS: &str = "v6CQRZOm4InaesuTHy8_qspndVRJ02dbtk0rhOGFw1nuYUxxCG6wJGztRNoWFMD5fYQV-6zJ6fB8ZiPPObfmlaycRiaRLP2Z8rR8LzdkUiCIzMtlyMVSnXToW6ZYd6HxcoHoPoLWgcUeOAZF4bIXT9krwRTjRNdPclDG9SRXHSukQajWSK2JgWppbTQExCOBeRc37MUqWNoI708Y9eaDx8cyW2jim2GEfArMTaA03NA-YRXe3rPkNcOxteLIulVB7Wcjx-tI0_ot2tCDdJJsnLRyfYD2Dekm9JCE0vhfrIpg2Ljp13rg45dvo5E5kTanFy51Xt6y9twtJkop-paNdw";

    fn identity_fixture() -> (serde_json::Value, jsonwebtoken::jwk::JwkSet) {
        let claims = json!({"iss":ISSUER,"aud":"oaiapp_test","sub":"test-subject","nonce":"expected-nonce","email":"test@example.invalid","iat":now(),"exp":now()+3600});
        let jwks = serde_json::from_value(json!({"keys":[{"kty":"RSA","use":"sig","kid":"test-key","alg":"RS256","n":TEST_RSA_MODULUS,"e":"AQAB"}]})).unwrap();
        (claims, jwks)
    }

    fn sign_test_identity(claims: &serde_json::Value) -> String {
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
        header.kid = Some("test-key".into());
        let key = jsonwebtoken::EncodingKey::from_rsa_pem(TEST_RSA_PRIVATE_KEY.as_bytes()).unwrap();
        jsonwebtoken::encode(&header, claims, &key).unwrap()
    }

    #[test]
    fn verified_identity_requires_signature_issuer_audience_expiry_and_nonce() {
        let (claims, jwks) = identity_fixture();
        let token = sign_test_identity(&claims);
        let verified = verify_claims(&token, "oaiapp_test", Some("expected-nonce"), &jwks).unwrap();
        assert_eq!(verified.sub, "test-subject");
        assert_eq!(verified.email.as_deref(), Some("test@example.invalid"));
        for (field, bad) in [
            ("iss", json!("https://attacker.example")),
            ("aud", json!("another-client")),
            ("nonce", json!("another-nonce")),
            ("sub", json!("")),
            ("exp", json!(now().saturating_sub(7200))),
        ] {
            let mut invalid = claims.clone();
            invalid[field] = bad;
            assert!(
                verify_claims(
                    &sign_test_identity(&invalid),
                    "oaiapp_test",
                    Some("expected-nonce"),
                    &jwks
                )
                .is_err(),
                "invalid {field} was accepted"
            );
        }
        for field in ["exp", "iss", "aud", "sub", "nonce"] {
            let mut missing = claims.clone();
            missing.as_object_mut().unwrap().remove(field);
            assert!(
                verify_claims(
                    &sign_test_identity(&missing),
                    "oaiapp_test",
                    Some("expected-nonce"),
                    &jwks
                )
                .is_err(),
                "missing {field} was accepted"
            );
        }
        let mut parts: Vec<String> = token.split('.').map(str::to_owned).collect();
        let mut forged_claims = claims.clone();
        forged_claims["sub"] = json!("forged-account");
        parts[1] = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&forged_claims).unwrap());
        assert!(verify_claims(
            &parts.join("."),
            "oaiapp_test",
            Some("expected-nonce"),
            &jwks
        )
        .is_err());
    }

    #[test]
    fn identity_rejects_algorithm_confusion_unknown_keys_and_invalid_tokens() {
        let (claims, jwks) = identity_fixture();
        let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::HS256);
        header.kid = Some("test-key".into());
        let token = jsonwebtoken::encode(
            &header,
            &claims,
            &jsonwebtoken::EncodingKey::from_secret(b"public-test-secret"),
        )
        .unwrap();
        assert!(verify_claims(&token, "oaiapp_test", Some("expected-nonce"), &jwks).is_err());
        let key = jsonwebtoken::EncodingKey::from_rsa_pem(TEST_RSA_PRIVATE_KEY.as_bytes()).unwrap();
        for kid in [None, Some("unknown-key".to_owned())] {
            let mut header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
            header.kid = kid;
            let token = jsonwebtoken::encode(&header, &claims, &key).unwrap();
            assert!(verify_claims(&token, "oaiapp_test", Some("expected-nonce"), &jwks).is_err());
        }
        for token in ["", "not.a.jwt", "eyJhbGciOiJub25lIn0.e30."] {
            assert!(verify_claims(token, "oaiapp_test", Some("expected-nonce"), &jwks).is_err());
        }
    }

    #[test]
    fn refreshed_identity_may_omit_nonce_but_must_still_verify_signature_and_audience() {
        let (mut claims, jwks) = identity_fixture();
        claims.as_object_mut().unwrap().remove("nonce");
        let token = sign_test_identity(&claims);
        assert_eq!(
            verify_claims(&token, "oaiapp_test", None, &jwks)
                .unwrap()
                .sub,
            "test-subject"
        );
        assert!(verify_claims(&token, "wrong-client", None, &jwks).is_err());
    }
    fn attempt() -> Attempt {
        Attempt {
            id: "attempt".into(),
            state: "expected-state".into(),
            nonce: "nonce".into(),
            verifier: "verifier".into(),
            redirect: "http://127.0.0.1:4321/auth/callback".into(),
            registration: None,
            client_id: "dynamic_agent_client".into(),
        }
    }
    #[test]
    fn callbacks_require_state_issued_client_and_single_values() {
        let pending = attempt();
        assert!(callback("code=x&state=wrong&client_id=oaiapp_123", &pending).is_err());
        assert!(callback(
            "code=x&state=expected-state&client_id=dynamic_agent_client",
            &pending
        )
        .is_err());
        assert!(callback(
            "code=x&state=expected-state&state=expected-state&client_id=oaiapp_123",
            &pending
        )
        .is_err());
        assert!(callback("error=access_denied&state=expected-state", &pending).is_err());
        assert_eq!(
            callback("code=x&state=expected-state&client_id=oaiapp_123", &pending).unwrap(),
            ("x".into(), "oaiapp_123".into())
        );
    }
    #[test]
    fn reauthorization_cannot_replace_client() {
        let mut pending = attempt();
        pending.client_id = "oaiapp_original".into();
        pending.registration = Some(Registration {
            id: "a".into(),
            client_id: "oaiapp_original".into(),
            subject: "sub".into(),
            label: "Account".into(),
            credential_enabled: false,
        });
        assert!(callback(
            "code=x&state=expected-state&client_id=oaiapp_other",
            &pending
        )
        .is_err());
        assert_eq!(
            callback("code=x&state=expected-state", &pending).unwrap().1,
            "oaiapp_original"
        );
    }
    #[test]
    fn endpoints_cannot_redirect_identity_tokens() {
        for url in [
            "http://auth.openai.com/keys",
            "https://auth.openai.com.evil.test/keys",
            "https://user:secret@auth.openai.com/keys",
            "https://auth.openai.com:444/keys",
        ] {
            assert!(checked_auth_url(url).is_err());
        }
        assert!(checked_auth_url("https://auth.openai.com/.well-known/jwks.json").is_ok());
    }
    #[test]
    fn plan_access_requires_both_scopes() {
        assert!(scopes_allowed(SCOPES));
        assert!(!scopes_allowed("openid profile email"));
        assert!(!scopes_allowed("chatgpt.tokens.use.direct"));
    }
    #[test]
    fn stream_must_complete_and_never_return_truncated_summary() {
        let delta = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"hello\"}\n\n";
        assert!(parse_stream(delta.as_bytes()).is_err());
        assert!(parse_stream(
            format!("{delta}data: {{\"type\":\"response.incomplete\"}}\n\n").as_bytes()
        )
        .is_err());
        assert_eq!(parse_stream(format!("{delta}data: {{\"type\":\"response.completed\",\"response\":{{\"status\":\"completed\"}}}}\n\ndata: [DONE]\n\n").as_bytes()).unwrap(),"hello");
    }
    #[test]
    fn pkce_matches_rfc7636_vector() {
        assert_eq!(
            URL_SAFE_NO_PAD.encode(Sha256::digest(
                b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
            )),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
}

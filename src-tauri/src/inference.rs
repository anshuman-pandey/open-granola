//! Local inference child process. Its executable is fixed, arguments bypass a
//! shell, and requests/responses travel through bounded anonymous pipes.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::thread::JoinHandle;
use std::time::Duration;

const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Response {
    ready: Option<bool>,
    answer: Option<String>,
    error: Option<String>,
}

pub struct LocalInference {
    child: Child,
    requests: Option<SyncSender<Vec<u8>>>,
    responses: Option<Receiver<Result<Response, String>>>,
    reader: Option<JoinHandle<()>>,
    writer: Option<JoinHandle<()>>,
    stopped: bool,
}

impl LocalInference {
    pub fn is_available(&mut self) -> bool {
        if self.stopped {
            return false;
        }
        match self.child.try_wait() {
            Ok(None) => true,
            _ => {
                self.shutdown();
                false
            }
        }
    }

    pub fn load(model_path: &Path) -> Result<Self> {
        let model = model_path
            .canonicalize()
            .context("Local model file is missing")?;
        let executable = worker_path()?;
        let mut child = Command::new(executable)
            .arg("--model")
            .arg(model)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            // Native inference libraries may log source material or prompts.
            .stderr(Stdio::null())
            .spawn()
            .context("Could not start the bundled local inference worker")?;
        let stdin = child
            .stdin
            .take()
            .context("Inference stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("Inference stdout is unavailable")?;
        let (responses_tx, responses) = mpsc::sync_channel(2);
        let (requests, requests_rx) = mpsc::sync_channel::<Vec<u8>>(1);
        let writer_responses = responses_tx.clone();
        let writer = std::thread::spawn(move || {
            let mut stdin = stdin;
            while let Ok(request) = requests_rx.recv() {
                if stdin
                    .write_all(&request)
                    .and_then(|_| stdin.flush())
                    .is_err()
                {
                    let _ =
                        writer_responses.try_send(Err("Local inference input pipe closed".into()));
                    break;
                }
            }
        });
        let reader = std::thread::spawn(move || {
            let mut stdout = BufReader::new(stdout);
            loop {
                let response = read_response(&mut stdout).map_err(|error| error.to_string());
                let failed = response.is_err();
                // A healthy worker has at most one outstanding response.
                // Stop reading on a flood instead of building an unbounded queue.
                if responses_tx.try_send(response).is_err() || failed {
                    break;
                }
            }
        });
        let mut worker = Self {
            child,
            requests: Some(requests),
            responses: Some(responses),
            reader: Some(reader),
            writer: Some(writer),
            stopped: false,
        };
        let response = worker.receive()?;
        if response.ready == Some(true) && response.answer.is_none() && response.error.is_none() {
            return Ok(worker);
        }
        worker.shutdown();
        bail!(
            "{}",
            response
                .error
                .unwrap_or_else(|| "The local inference worker did not become ready".into())
        )
    }

    pub fn complete(&mut self, system: &str, user: &str, max_tokens: usize) -> Result<String> {
        let request = encode_request(system, user, max_tokens)?;
        if self.stopped {
            bail!("The local inference worker stopped. Retry to load the model again.");
        }
        if self
            .requests
            .as_ref()
            .context("Inference worker stopped")?
            .try_send(request)
            .is_err()
        {
            self.shutdown();
            bail!("The local inference worker is unavailable; retry the request");
        }
        let response = self.receive()?;
        match (response.ready, response.answer, response.error) {
            (None, Some(answer), None) if !answer.trim().is_empty() => Ok(answer),
            (None, None, Some(error)) => bail!("{error}"),
            _ => {
                self.shutdown();
                bail!("The local inference worker returned an invalid response");
            }
        }
    }

    fn receive(&mut self) -> Result<Response> {
        match self
            .responses
            .as_ref()
            .context("Inference worker stopped")?
            .recv_timeout(TIMEOUT)
        {
            Ok(Ok(response)) => Ok(response),
            result => {
                self.shutdown();
                match result {
                    Ok(Err(error)) => bail!("{error}"),
                    Err(mpsc::RecvTimeoutError::Timeout) => bail!("Local inference timed out after 180 seconds. Your saved transcript is unchanged."),
                    _ => bail!("The local inference worker exited unexpectedly. Your saved transcript is unchanged."),
                }
            }
        }
    }

    fn shutdown(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        self.requests.take();
        self.responses.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
    }
}

impl Drop for LocalInference {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn worker_path() -> Result<PathBuf> {
    let name = if cfg!(windows) {
        "open-granola-inference.exe"
    } else {
        "open-granola-inference"
    };
    let current = std::env::current_exe().context("Cannot locate the application executable")?;
    let adjacent = current
        .parent()
        .context("Application directory is unavailable")?
        .join(name);
    if adjacent.is_file() {
        return Ok(adjacent);
    }
    #[cfg(debug_assertions)]
    {
        let development = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target/debug")
            .join(name);
        if development.is_file() {
            return Ok(development);
        }
    }
    bail!("The bundled local inference worker is missing. Rebuild the desktop app and worker together.")
}

fn encode_request(system: &str, user: &str, max_tokens: usize) -> Result<Vec<u8>> {
    if system.len().saturating_add(user.len()) > MAX_REQUEST_BYTES
        || !(1..=2000).contains(&max_tokens)
    {
        bail!("Inference requests must fit within 1 MiB and request 1–2000 tokens");
    }
    let mut request = serde_json::to_vec(
        &serde_json::json!({"system":system,"user":user,"max_tokens":max_tokens}),
    )?;
    request.push(b'\n');
    if request.len() > MAX_REQUEST_BYTES {
        bail!("Encoded inference request exceeds 1 MiB");
    }
    Ok(request)
}

fn read_response(reader: &mut impl BufRead) -> Result<Response> {
    let mut line = Vec::new();
    reader
        .take(MAX_RESPONSE_BYTES as u64 + 1)
        .read_until(b'\n', &mut line)
        .context("Could not read local inference response")?;
    if line.is_empty() {
        bail!("Local inference output pipe closed");
    }
    if line.len() > MAX_RESPONSE_BYTES || !line.ends_with(b"\n") {
        bail!("Local inference response exceeded its limit or was incomplete");
    }
    serde_json::from_slice(&line).context("Local inference response was not valid protocol JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn requests_bound_encoded_bytes_and_generation() {
        assert!(encode_request("system", "hello", 100).is_ok());
        assert!(encode_request("", "hi", 0).is_err());
        assert!(encode_request("", "hi", 2001).is_err());
        assert!(encode_request("", &"x".repeat(MAX_REQUEST_BYTES), 1).is_err());
        assert!(encode_request("", &"\n".repeat(MAX_REQUEST_BYTES / 2), 1).is_err());
    }

    #[test]
    fn protocol_rejects_oversized_truncated_and_invalid_output() {
        for bytes in [
            vec![b'x'; MAX_RESPONSE_BYTES + 1],
            b"{\"answer\":\"hi\"}".to_vec(),
            b"not json\n".to_vec(),
            b"{\"surprise\":true}\n".to_vec(),
        ] {
            assert!(read_response(&mut Cursor::new(bytes)).is_err());
        }
        assert_eq!(
            read_response(&mut Cursor::new(b"{\"answer\":\"hi\"}\n"))
                .unwrap()
                .answer
                .as_deref(),
            Some("hi")
        );
    }
}

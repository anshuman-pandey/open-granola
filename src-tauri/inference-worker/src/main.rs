//! Private, socket-free inference process. Requests and results use bounded
//! newline-delimited JSON over inherited pipes; content is never logged.
mod engine;

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::io::{BufRead, BufReader, Read, Write};

const MAX_REQUEST_BYTES: u64 = 1024 * 1024;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    system: String,
    user: String,
    max_tokens: usize,
}

fn respond(value: serde_json::Value) -> Result<()> {
    let mut out = std::io::stdout().lock();
    serde_json::to_writer(&mut out, &value)?;
    out.write_all(b"\n")?;
    out.flush()?;
    Ok(())
}

fn run() -> Result<()> {
    // The desktop applies its network policy before spawning this child.
    // macOS inherits that sandbox across exec; reapplying sandbox_init fails.
    let mut args = std::env::args_os().skip(1);
    if args.next().as_deref() != Some(std::ffi::OsStr::new("--model")) {
        bail!("Expected a local model path");
    }
    let path = std::path::PathBuf::from(args.next().context("Missing model path")?);
    if args.next().is_some() {
        bail!("Unexpected worker arguments");
    }
    let engine = engine::Engine::load(&path)?;
    respond(serde_json::json!({"ready":true}))?;
    let mut input = BufReader::new(std::io::stdin().lock());
    loop {
        let mut line = String::new();
        let read = input
            .by_ref()
            .take(MAX_REQUEST_BYTES + 1)
            .read_line(&mut line)?;
        if read == 0 {
            return Ok(());
        }
        if read as u64 > MAX_REQUEST_BYTES || !line.ends_with('\n') {
            bail!("Inference request exceeds limit or is incomplete");
        }
        let result = serde_json::from_str::<Request>(&line)
            .context("Invalid inference request")
            .and_then(|request| {
                if request.max_tokens == 0 || request.max_tokens > 2000 {
                    bail!("Output token limit must be between 1 and 2000");
                }
                engine.completion(&request.system, &request.user, request.max_tokens)
            });
        match result {
            Ok(answer) => respond(serde_json::json!({"answer":answer}))?,
            Err(error) => respond(serde_json::json!({"error":error.to_string()}))?,
        }
    }
}

fn main() {
    if let Err(error) = run() {
        let _ = respond(serde_json::json!({"error":error.to_string()}));
        std::process::exit(1);
    }
}

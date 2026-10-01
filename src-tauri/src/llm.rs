//! Local LLM: note enhancement, source-grounded library questions and recipes.
//! Runs through an isolated local llama.cpp worker. Models are GGUF files in the local
//! library directory. The current model filename is qwen3-4b-q4.gguf.

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

use crate::transcribe::Segment;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedNote {
    pub title: String,
    pub summary: String,
    pub chapters: Vec<Chapter>,
    pub decisions: Vec<String>,
    pub action_items: Vec<ActionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub title: String,
    pub timestamp: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
}

pub struct LocalLlm {
    model_path: PathBuf,
    engine: parking_lot::Mutex<crate::inference::LocalInference>,
}

const ENHANCE_SYSTEM: &str = "\
You are Open Granola, a meeting-notes engine running entirely on the user's device. \
Given a diarized transcript, produce STRICT JSON with keys: title, summary, \
chapters[{title,timestamp,body}], decisions[], action_items[{text,owner,due}]. \
Rules: prefer concrete facts and exact numbers; never invent content; keep \
chapter bodies under 45 words; timestamps as mm:ss; action items must have an \
owner if any speaker volunteered or was assigned. Output JSON only.";

const COMMITMENTS_SYSTEM: &str = "\
You are Open Granola's commitment extractor. From a diarized transcript, find every \
explicit promise, offer, or assignment — phrases like \"I'll have it by Friday\", \
\"I can take that\", \"send me X and I'll review\". Emit STRICT JSON: an array \
{text, owner, due, evidence}. Rules: owner = the speaker who volunteered or was \
assigned (use their label if unnamed); due = the deadline phrase as spoken, or \
null; evidence = the exact quote it came from. Ignore vague intentions (\"we \
should\", \"let's think about\"). Output [] if there are none.";

impl LocalLlm {
    pub fn load(model_path: &Path) -> Result<Self> {
        Ok(Self {
            model_path: model_path.to_path_buf(),
            engine: parking_lot::Mutex::new(crate::inference::LocalInference::load(model_path)?),
        })
    }

    fn completion(&self, system: &str, user: &str, max_tokens: usize) -> Result<String> {
        let mut engine = self.engine.lock();
        if !engine.is_available() {
            *engine = crate::inference::LocalInference::load(&self.model_path)?;
        }
        engine.complete(system, user, max_tokens)
    }

    /// Turn a finished transcript into structured notes (the "enhance" step).
    pub fn enhance(&self, transcript: &[Segment], template_md: &str) -> Result<EnhancedNote> {
        let mut text = String::new();
        for s in transcript {
            text.push_str(&format!(
                "[{:02}:{:02}] Speaker {}: {}\n",
                s.start_ms / 60000,
                (s.start_ms / 1000) % 60,
                s.speaker,
                s.text
            ));
        }
        let user = format!("Template:\n{template_md}\n\nTranscript:\n{text}");
        let raw = self.completion(ENHANCE_SYSTEM, &user, 1200)?;
        let json = extract_json(&raw)?;
        serde_json::from_str(&json).context("enhancement produced invalid JSON")
    }

    /// Answer from transcript passages retrieved with SQLite full-text search.
    pub fn chat(&self, question: &str, context_chunks: &[String]) -> Result<String> {
        let user = format!(
            "Answer ONLY from the supplied excerpts, citing their bracketed labels exactly. Summaries have no transcript timestamp. If the answer is absent, say so; the excerpts may be incomplete. Context:\n{}\n\nQ: {question}",
            context_chunks.join("\n---\n")
        );
        self.completion(
            "You are Open Granola's librarian. Be precise; cite sources.",
            &user,
            600,
        )
    }

    /// Extract explicit promises from a finished transcript — the raw material
    /// of the cross-meeting commitment ledger.
    pub fn extract_commitments(&self, transcript: &[Segment]) -> Result<Vec<Commitment>> {
        let mut text = String::new();
        for s in transcript {
            text.push_str(&format!("Speaker {}: {}\n", s.speaker, s.text));
        }
        let raw = self.completion(COMMITMENTS_SYSTEM, &text, 900)?;
        serde_json::from_str(&extract_json(&raw)?)
            .context("model returned invalid structured output")
    }

    /// Run a recipe (shareable markdown prompt pack) over a meeting or library.
    pub fn run_recipe(&self, recipe_prompt: &str, context: &[String]) -> Result<String> {
        let user = format!("{recipe_prompt}\n\nMaterial:\n{}", context.join("\n---\n"));
        self.completion(
            "Follow the user's recipe exactly. Ground every claim in the material.",
            &user,
            900,
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commitment {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
    pub evidence: Option<String>,
}

/// Parse the first complete JSON value, including braces inside strings.
fn extract_json(raw: &str) -> Result<String> {
    for (start, _) in raw.char_indices().filter(|(_, c)| matches!(c, '{' | '[')) {
        let mut parser =
            serde_json::Deserializer::from_str(&raw[start..]).into_iter::<serde_json::Value>();
        if let Some(Ok(value)) = parser.next() {
            if value.is_object() || value.is_array() {
                return Ok(raw[start..start + parser.byte_offset()].to_string());
            }
        }
    }
    bail!("No complete JSON object or array in model output")
}

#[cfg(test)]
mod tests {
    use super::extract_json;
    #[test]
    fn extracts_fenced_json_without_trailing_prose() {
        assert_eq!(
            extract_json("Here:\n```json\n{\"text\":\"a } and [ café\"}\n``` [end]").unwrap(),
            "{\"text\":\"a } and [ café\"}"
        );
        assert_eq!(extract_json("[not json] then [1,2]").unwrap(), "[1,2]");
    }
    #[test]
    fn malformed_output_never_panics() {
        for raw in ["", "}{", "[", "hello", "{broken}"] {
            assert!(extract_json(raw).is_err());
        }
    }
}

//! Local LLM: note enhancement, live assist, chat-with-library, embeddings.
//! Runs on llama.cpp via llama-cpp-2. Models are GGUF files in the local
//! library dir; chosen in Settings (Qwen3-4B default, Llama-3.1-8B optional).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;

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
    backend: LlamaBackend,
    model: LlamaModel,
}

const ENHANCE_SYSTEM: &str = "\
You are Sotto, a meeting-notes engine running entirely on the user's device. \
Given a diarized transcript, produce STRICT JSON with keys: title, summary, \
chapters[{title,timestamp,body}], decisions[], action_items[{text,owner,due}]. \
Rules: prefer concrete facts and exact numbers; never invent content; keep \
chapter bodies under 45 words; timestamps as mm:ss; action items must have an \
owner if any speaker volunteered or was assigned. Output JSON only.";

const LIVE_ASSIST_SYSTEM: &str = "\
You are Sotto Live Assist. Given a rolling transcript window and (optionally) \
snippets from the user's past notes, emit STRICT JSON: an array of up to 2 \
suggestions {kind: recall|fact|follow-up, title, body}. Suggest only what is \
genuinely useful RIGHT NOW; else output []. Never fabricate citations.";

const COMMITMENTS_SYSTEM: &str = "\
You are Sotto's commitment extractor. From a diarized transcript, find every \
explicit promise, offer, or assignment — phrases like \"I'll have it by Friday\", \
\"I can take that\", \"send me X and I'll review\". Emit STRICT JSON: an array \
{text, owner, due, evidence}. Rules: owner = the speaker who volunteered or was \
assigned (use their label if unnamed); due = the deadline phrase as spoken, or \
null; evidence = the exact quote it came from. Ignore vague intentions (\"we \
should\", \"let's think about\"). Output [] if there are none.";

const BRIEF_SYSTEM: &str = "\
You are Sotto's briefer. Given an upcoming meeting (title, attendees) and \
excerpts from relevant past meetings plus open commitments involving those \
attendees, write a pre-meeting brief as STRICT JSON: \
{recap, open_commitments[{owner,text,due,overdue}], worth_raising[]}. \
recap: <=60 words on what happened last time with these people. \
worth_raising: exactly 3 sharp, specific questions or flags for this meeting — \
grounded in the excerpts, never generic advice. Output JSON only.";

impl LocalLlm {
    pub fn load(model_path: &Path) -> Result<Self> {
        let backend = LlamaBackend::init()?;
        let params = LlamaModelParams::default(); // GPU offload auto: Metal/CUDA
        let model = LlamaModel::load_from_file(&backend, model_path, &params)
            .context("failed to load GGUF model")?;
        Ok(Self { backend, model })
    }

    fn completion(&self, system: &str, user: &str, max_tokens: usize) -> Result<String> {
        let ctx_params = LlamaContextParams::default().with_n_ctx(std::num::NonZeroU32::new(8192));
        let mut ctx = self.model.new_context(&self.backend, ctx_params)?;
        let prompt = format!(
            "<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n"
        );
        let tokens = self.model.str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)?;
        let mut batch = llama_cpp_2::llama_batch::LlamaBatch::new(8192, 1);
        let last = tokens.len().saturating_sub(1);
        for (i, &t) in tokens.iter().enumerate() {
            batch.add(t, i as i32, &[0], i == last)?;
        }
        ctx.decode(&mut batch)?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(0.2),
            LlamaSampler::top_p(0.9, 1),
        ]);
        let mut out = String::new();
        let mut n_cur = tokens.len();
        for _ in 0..max_tokens {
            let token = sampler.sample(&ctx, batch.i_batch(-1));
            if self.model.is_eog_token(token) {
                break;
            }
            out.push_str(&self.model.token_to_str(token, llama_cpp_2::model::Special::Plaintext)?);
            batch.clear();
            batch.add(token, n_cur as i32, &[0], true)?;
            n_cur += 1;
            ctx.decode(&mut batch)?;
        }
        Ok(out)
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
        Ok(serde_json::from_str(&json).context("enhancement produced invalid JSON")?)
    }

    /// Live assist suggestions during the meeting (the differentiator).
    pub fn live_assist(&self, window: &[Segment], recalled: &[String]) -> Result<Vec<Suggestion>> {
        let mut text = String::new();
        for s in window.iter().rev().take(12).rev() {
            text.push_str(&format!("Speaker {}: {}\n", s.speaker, s.text));
        }
        let user = format!(
            "Past-note snippets:\n{}\n\nLive window:\n{text}",
            recalled.join("\n---\n")
        );
        let raw = self.completion(LIVE_ASSIST_SYSTEM, &user, 220)?;
        Ok(serde_json::from_str(&extract_json(&raw)?).unwrap_or_default())
    }

    /// Chat over one meeting or the whole local library (RAG over sqlite-vec).
    pub fn chat(&self, question: &str, context_chunks: &[String]) -> Result<String> {
        let user = format!(
            "Answer ONLY from this context, citing [meeting, timestamp]:\n{}\n\nQ: {question}",
            context_chunks.join("\n---\n")
        );
        self.completion("You are Sotto's librarian. Be precise; cite sources.", &user, 600)
    }

    /// Extract explicit promises from a finished transcript — the raw material
    /// of the cross-meeting commitment ledger.
    pub fn extract_commitments(&self, transcript: &[Segment]) -> Result<Vec<Commitment>> {
        let mut text = String::new();
        for s in transcript {
            text.push_str(&format!("Speaker {}: {}\n", s.speaker, s.text));
        }
        let raw = self.completion(COMMITMENTS_SYSTEM, &text, 900)?;
        Ok(serde_json::from_str(&extract_json(&raw)?).unwrap_or_default())
    }

    /// Pre-meeting brief: recap of last time + open commitments + worth raising.
    /// `context` is RAG output (past-meeting excerpts matched by attendees/title).
    pub fn generate_brief(&self, title: &str, attendees: &[String], context: &[String]) -> Result<Brief> {
        let user = format!(
            "Upcoming meeting: {title}\nAttendees: {}\n\nRelevant history:\n{}",
            attendees.join(", "),
            context.join("\n---\n")
        );
        let raw = self.completion(BRIEF_SYSTEM, &user, 700)?;
        serde_json::from_str(&extract_json(&raw)?).context("brief produced invalid JSON")
    }

    /// Run a recipe (shareable markdown prompt pack) over a meeting or library.
    pub fn run_recipe(&self, recipe_prompt: &str, context: &[String]) -> Result<String> {
        let user = format!("{recipe_prompt}\n\nMaterial:\n{}", context.join("\n---\n"));
        self.completion("Follow the user's recipe exactly. Ground every claim in the material.", &user, 900)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Commitment {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
    pub evidence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Brief {
    pub recap: String,
    pub open_commitments: Vec<BriefCommitment>,
    pub worth_raising: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BriefCommitment {
    pub owner: String,
    pub text: String,
    pub due: Option<String>,
    pub overdue: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    pub kind: String,
    pub title: String,
    pub body: String,
}

/// Models occasionally wrap JSON in prose or fences — peel it back.
fn extract_json(raw: &str) -> Result<String> {
    let start = raw.find(['{', '[']).context("no JSON in model output")?;
    let end = raw.rfind(['}', ']']).context("no JSON end")?;
    Ok(raw[start..=end].to_string())
}

//! Local microphone transcription. A single input does not identify speakers.
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: u8,
    pub text: String,
    #[serde(default)]
    pub final_: bool,
}

pub struct WhisperEngine {
    ctx: WhisperContext,
}

impl WhisperEngine {
    pub fn load(model_path: &Path) -> Result<Self> {
        if !model_path.is_file() {
            bail!(
                "Transcription model missing. Install whisper-large-v3-turbo.bin in {}",
                model_path.parent().unwrap_or(Path::new(".")).display()
            );
        }
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().context("invalid model path")?,
            WhisperContextParameters::default(),
        )
        .context("failed to load transcription model")?;
        Ok(Self { ctx })
    }

    pub fn transcribe_window(&mut self, samples: &[f32], offset_ms: u64) -> Result<Vec<Segment>> {
        if samples.is_empty() || samples.iter().all(|s| s.abs() < 0.0001) {
            return Ok(Vec::new());
        }
        let duration_ms = samples.len() as u64 * 1000 / crate::audio::WHISPER_RATE as u64;
        // whisper requires enough input to encode even a short final tail.
        let padded;
        let input = if samples.len() < crate::audio::WHISPER_RATE {
            padded = {
                let mut p = samples.to_vec();
                p.resize(crate::audio::WHISPER_RATE, 0.0);
                p
            };
            padded.as_slice()
        } else {
            samples
        };
        let mut state = self.ctx.create_state()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_print_special(false);
        params.set_language(None);
        params.set_translate(false);
        state.full(params, input)?;
        let mut out = Vec::new();
        for segment in state.as_iter() {
            let text = segment.to_str()?.trim().to_string();
            if text.is_empty() {
                continue;
            }
            let start = (segment.start_timestamp().max(0) as u64 * 10).min(duration_ms);
            let end = (segment.end_timestamp().max(0) as u64 * 10)
                .min(duration_ms)
                .max(start);
            out.push(Segment {
                start_ms: offset_ms + start,
                end_ms: offset_ms + end,
                speaker: 0,
                text,
                final_: true,
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_model_returns_an_actionable_error_before_loading_native_code() {
        let directory =
            std::env::temp_dir().join(format!("opengranola-missing-{}", uuid::Uuid::new_v4()));
        let error = WhisperEngine::load(&directory.join("whisper-large-v3-turbo.bin"))
            .err()
            .expect("missing model must fail");
        assert!(error.to_string().contains("Transcription model missing"));
        assert!(error.to_string().contains("whisper-large-v3-turbo.bin"));
    }
}

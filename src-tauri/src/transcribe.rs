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
    options: TranscriptionOptions,
}

#[derive(Debug, PartialEq)]
struct TranscriptionOptions {
    language: Option<&'static str>,
    translate: bool,
}

impl TranscriptionOptions {
    fn for_model(language: &str, multilingual: bool) -> Result<Self> {
        let language = crate::language::whisper_language(language)?;
        if !multilingual && language != Some("en") {
            bail!("The installed transcription model supports English only. Select English or install a multilingual Whisper model before recording.");
        }
        Ok(Self {
            language,
            translate: false,
        })
    }
}

impl WhisperEngine {
    pub fn load(model_path: &Path, language: &str) -> Result<Self> {
        crate::language::whisper_language(language)?;
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
        let options = TranscriptionOptions::for_model(language, ctx.is_multilingual())?;
        Ok(Self { ctx, options })
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
        // None enables automatic language detection while still transcribing.
        // detect_language=true would request detection-only in whisper.cpp.
        params.set_language(self.options.language);
        params.set_detect_language(false);
        params.set_translate(self.options.translate);
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
        let error = WhisperEngine::load(&directory.join("whisper-large-v3-turbo.bin"), "auto")
            .err()
            .expect("missing model must fail");
        assert!(error.to_string().contains("Transcription model missing"));
        assert!(error.to_string().contains("whisper-large-v3-turbo.bin"));
    }

    #[test]
    fn automatic_and_manual_capture_both_preserve_source_speech() {
        assert_eq!(
            TranscriptionOptions::for_model("auto", true).unwrap(),
            TranscriptionOptions {
                language: None,
                translate: false
            }
        );
        for code in ["hi", "en", "ja", "ar", "bn"] {
            assert_eq!(
                TranscriptionOptions::for_model(code, true).unwrap(),
                TranscriptionOptions {
                    language: Some(code),
                    translate: false
                }
            );
        }
        assert!(TranscriptionOptions::for_model("auto", false).is_err());
        assert!(TranscriptionOptions::for_model("hi", false).is_err());
        assert!(TranscriptionOptions::for_model("en", false).is_ok());
        assert!(TranscriptionOptions::for_model("hi\0", true).is_err());
    }
}

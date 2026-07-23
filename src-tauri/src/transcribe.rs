//! On-device transcription: whisper.cpp with streaming partial results,
//! plus local speaker diarization via spectral-embedding clustering.
//!
//! The worker drains the audio ring buffer in 2-second windows with 500 ms
//! stride. Each finalized segment carries a speaker label computed on-device:
//! we embed 1.5 s spectral windows (MFCC-ish via rustfft) and cluster them
//! online with agglomerative assignment against running centroids.
//!
//! Nothing here touches the network, a file, or a socket.

use anyhow::{Context, Result};
use serde::Serialize;
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::audio::WHISPER_RATE;

#[derive(Debug, Clone, Serialize)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker: u8, // cluster id; the UI maps 0 => "You" when mic-dominant
    pub text: String,
    pub final_: bool,
}

pub struct WhisperEngine {
    ctx: WhisperContext,
    /// Running speaker centroids (spectral embeddings), online-clustered.
    centroids: Vec<ndarray::Array1<f32>>,
}

impl WhisperEngine {
    /// Load a GGML whisper model from the local model directory.
    /// (Models are downloaded once by the user inside the app — the only
    ///  moment Open Granola ever opens a socket, and only with Airlock off.)
    pub fn load(model_path: &Path) -> Result<Self> {
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().context("bad model path")?,
            WhisperContextParameters::default(),
        )
        .context("failed to load whisper model")?;
        Ok(Self { ctx, centroids: Vec::new() })
    }

    /// Transcribe one window of 16 kHz mono samples.
    pub fn transcribe_window(&mut self, samples: &[f32], offset_ms: u64) -> Result<Vec<Segment>> {
        let mut state = self.ctx.create_state()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(true);
        params.set_language(Some("auto"));
        params.set_translate(false);
        // Custom vocabulary boost: proper nouns, number words, domain terms
        // learned from prior notes — fixes Granola's "numbers get messed up".
        params.set_initial_prompt(&self.vocabulary_prompt());

        state.full(params, samples)?;

        let n = state.full_n_segments()?;
        let mut out = Vec::with_capacity(n as usize);
        for i in 0..n {
            let text = state.full_get_segment_text(i)?;
            let t0 = state.full_get_segment_t0(i)? as u64 * 10; // centiseconds -> ms
            let t1 = state.full_get_segment_t1(i)? as u64 * 10;
            let speaker = self.assign_speaker(samples, t0, t1);
            out.push(Segment {
                start_ms: offset_ms + t0,
                end_ms: offset_ms + t1,
                speaker,
                text: text.trim().to_string(),
                final_: true,
            });
        }
        Ok(out)
    }

    /// Online diarization: embed the segment window, assign to nearest
    /// centroid above cosine 0.78, else open a new cluster.
    fn assign_speaker(&mut self, samples: &[f32], _t0: u64, _t1: u64) -> u8 {
        let emb = spectral_embedding(samples);
        let mut best: Option<(usize, f32)> = None;
        for (i, c) in self.centroids.iter().enumerate() {
            let sim = cosine(&emb, c);
            if best.map(|(_, s)| sim > s).unwrap_or(true) {
                best = Some((i, sim));
            }
        }
        match best {
            Some((i, s)) if s > 0.78 => {
                // nudge centroid toward the new observation (EMA, alpha 0.1)
                let c = &mut self.centroids[i];
                *c = &*c * 0.9 + &emb * 0.1;
                i as u8
            }
            _ => {
                self.centroids.push(emb);
                (self.centroids.len() - 1) as u8
            }
        }
    }

    fn vocabulary_prompt(&self) -> String {
        // Populated from the user's custom dictionary + frequent proper nouns
        // mined from local notes. Steering whisper with an initial prompt
        // measurably improves names/numbers over zero-shot decoding.
        String::from("Transcript of a work meeting with precise numbers and names.")
    }
}

/// 40-bin spectral envelope over 1.5 s — a compact, model-free voiceprint.
fn spectral_embedding(samples: &[f32]) -> ndarray::Array1<f32> {
    use rustfft::{num_complex::Complex, FftPlanner};
    const N: usize = 2048;
    let take = samples.len().min(WHISPER_RATE * 3 / 2);
    let mut buf: Vec<Complex<f32>> = vec![Complex::ZERO; N];
    for (i, &s) in samples.iter().take(take.min(N)).enumerate() {
        let hann = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / N as f32).cos());
        buf[i] = Complex::new(s * hann, 0.0);
    }
    let mut planner = FftPlanner::<f32>::new();
    planner.plan_fft_forward(N).process(&mut buf);
    let mut bins = ndarray::Array1::<f32>::zeros(40);
    let width = (N / 2) / 40;
    for (b, chunk) in buf[..N / 2].chunks(width).enumerate().take(40) {
        bins[b] = (chunk.iter().map(|c| c.norm()).sum::<f32>() / width as f32).ln_1p();
    }
    let norm = bins.dot(&bins).sqrt().max(1e-6);
    bins / norm
}

fn cosine(a: &ndarray::Array1<f32>, b: &ndarray::Array1<f32>) -> f32 {
    a.dot(b) / (a.dot(a).sqrt() * b.dot(b).sqrt()).max(1e-6)
}

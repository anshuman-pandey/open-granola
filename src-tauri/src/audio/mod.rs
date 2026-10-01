//! Microphone capture. Streams stay on their owner thread; audio stays in RAM.
//! System loopback and speaker identification are not implemented yet.
mod loopback;

use crate::transcribe::{Segment, WhisperEngine};
use anyhow::{bail, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use parking_lot::Mutex;
use ringbuf::{traits::*, HeapRb};
use rubato::Resampler;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const WHISPER_RATE: usize = 16_000;
const WINDOW_SAMPLES: usize = WHISPER_RATE * 5;

#[derive(Clone)]
pub struct CapturedMeeting {
    pub transcript: Vec<Segment>,
    pub started_at: String,
    pub duration_s: u64,
    pub title: Option<String>,
}

/// Only these thread-safe handles enter shared Tauri state. CPAL streams are
/// neither moved between threads nor unsafely marked Send/Sync.
pub struct CaptureSession {
    stop: mpsc::Sender<()>,
    worker: Option<JoinHandle<CapturedMeeting>>,
}

impl CaptureSession {
    pub fn begin(app: AppHandle, model: PathBuf, title: Option<String>) -> Result<Self> {
        let (stop, stopped) = mpsc::channel();
        let (ready, startup) = mpsc::sync_channel(1);
        let worker = std::thread::Builder::new().name("microphone-capture".into()).spawn(move || {
            let mut result = CapturedMeeting {
                transcript: Vec::new(), started_at: chrono::Utc::now().to_rfc3339(),
                duration_s: 0, title,
            };
            let capture = (|| -> Result<_> {
                let engine = WhisperEngine::load(&model)?;
                let dropped = Arc::new(AtomicUsize::new(0));
                let error = Arc::new(Mutex::new(None));
                let (stream, consumer, resampler) = microphone(dropped.clone(), error.clone())?;
                stream.play().context("could not start microphone")?;
                Ok((engine, stream, consumer, resampler, dropped, error))
            })();
            let (mut engine, stream, mut consumer, mut resampler, dropped, error) = match capture {
                Ok(c) => { let _ = ready.send(Ok(())); c }
                Err(e) => { let _ = ready.send(Err(format!("{e:#}"))); return result; }
            };
            result.started_at = chrono::Utc::now().to_rfc3339();
            let mut pending = Vec::with_capacity(WINDOW_SAMPLES * 2);
            let mut offset = 0u64;
            let mut stream = Some(stream);
            loop {
                let stopping = !matches!(stopped.recv_timeout(Duration::from_millis(100)), Err(mpsc::RecvTimeoutError::Timeout));
                let device_error = error.lock().take();
                let overflow = dropped.swap(0, Ordering::Relaxed);
                if stopping || device_error.is_some() || overflow > 0 {
                    // Stop callbacks before draining. The final partial window is
                    // still transcribed; frontend event delivery is never storage.
                    drop(stream.take());
                }
                let mut input = Vec::new();
                while let Some(sample) = consumer.try_pop() { input.push(sample); }
                let final_window = stream.is_none();
                match resampler.push(&input, final_window) {
                    Ok(samples) => pending.extend(samples),
                    Err(e) => { let _ = app.emit("capture-error", format!("Audio resampling failed: {e}")); break; }
                }
                while pending.len() >= WINDOW_SAMPLES || (final_window && !pending.is_empty()) {
                    let size = pending.len().min(WINDOW_SAMPLES);
                    let samples: Vec<_> = pending.drain(..size).collect();
                    match engine.transcribe_window(&samples, offset) {
                        Ok(segments) => for seg in segments {
                            result.transcript.push(seg.clone());
                            let _ = app.emit("segment", seg);
                        },
                        Err(e) => { let _ = app.emit("capture-error", format!("Transcription failed for an audio window: {e}. Stop to save the recovered transcript.")); }
                    }
                    offset += size as u64 * 1000 / WHISPER_RATE as u64;
                }
                if let Some(e) = device_error { let _ = app.emit("capture-error", format!("Microphone disconnected: {e}. Stop to save the recovered transcript.")); }
                if overflow > 0 { let _ = app.emit("capture-error", "Capture stopped because transcription could not keep up. Stop to save the recovered transcript."); }
                if final_window { break; }
            }
            result.duration_s = (resampler.input_count / resampler.input_rate) as u64;
            result
        })?;
        match startup
            .recv()
            .context("capture worker failed during startup")?
        {
            Ok(()) => Ok(Self {
                stop,
                worker: Some(worker),
            }),
            Err(e) => {
                let _ = worker.join();
                bail!(e)
            }
        }
    }

    pub fn finish(mut self) -> Result<CapturedMeeting> {
        let _ = self.stop.send(());
        self.worker
            .take()
            .context("capture already stopped")?
            .join()
            .map_err(|_| anyhow::anyhow!("capture worker terminated unexpectedly"))
    }
}

impl Drop for CaptureSession {
    fn drop(&mut self) {
        let _ = self.stop.send(());
    }
}

fn microphone(
    dropped: Arc<AtomicUsize>,
    error: Arc<Mutex<Option<String>>>,
) -> Result<(cpal::Stream, ringbuf::HeapCons<f32>, AudioResampler)> {
    let mic = cpal::default_host()
        .default_input_device()
        .context("No microphone found. Connect an input device and check microphone permission.")?;
    let config = mic
        .default_input_config()
        .context("could not read microphone configuration")?;
    let rate = config.sample_rate().0 as usize;
    let resampler = AudioResampler::new(rate)?;
    let (producer, consumer) = HeapRb::<f32>::new(rate * 60).split();
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            build_stream::<f32>(&mic, config.into(), producer, dropped, error)?
        }
        cpal::SampleFormat::I16 => {
            build_stream::<i16>(&mic, config.into(), producer, dropped, error)?
        }
        cpal::SampleFormat::U16 => {
            build_stream::<u16>(&mic, config.into(), producer, dropped, error)?
        }
        other => bail!("Unsupported microphone sample format: {other:?}"),
    };
    Ok((stream, consumer, resampler))
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    mut producer: ringbuf::HeapProd<f32>,
    dropped: Arc<AtomicUsize>,
    error: Arc<Mutex<Option<String>>>,
) -> Result<cpal::Stream>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let channels = usize::from(config.channels);
    // The real-time callback only downmixes and enqueues. FFT resampling and
    // allocations belong on the worker, outside the audio device callback.
    Ok(device.build_input_stream(
        &config,
        move |data: &[T], _| {
            for frame in data.chunks_exact(channels) {
                let sample = frame
                    .iter()
                    .map(|s| <f32 as cpal::FromSample<T>>::from_sample_(*s))
                    .sum::<f32>()
                    / channels as f32;
                let sample = if sample.is_finite() {
                    sample.clamp(-1.0, 1.0)
                } else {
                    0.0
                };
                if producer.try_push(sample).is_err() {
                    dropped.fetch_add(1, Ordering::Relaxed);
                }
            }
        },
        move |e| {
            *error.lock() = Some(e.to_string());
        },
        None,
    )?)
}

/// Buffer arbitrary device callback sizes, compensate filter delay, and flush
/// the remaining input on stop so the last words are not silently discarded.
struct AudioResampler {
    inner: rubato::FftFixedIn<f32>,
    pending: Vec<f32>,
    skip: usize,
    input_rate: usize,
    input_count: usize,
    output_count: usize,
}

impl AudioResampler {
    fn new(input_rate: usize) -> Result<Self> {
        let inner = rubato::FftFixedIn::new(input_rate, WHISPER_RATE, 1024, 2, 1)?;
        let skip = inner.output_delay();
        Ok(Self {
            inner,
            pending: Vec::new(),
            skip,
            input_rate,
            input_count: 0,
            output_count: 0,
        })
    }
    fn push(&mut self, input: &[f32], finish: bool) -> Result<Vec<f32>> {
        self.pending.extend_from_slice(input);
        self.input_count += input.len();
        let mut out = Vec::new();
        while self.pending.len() >= self.inner.input_frames_next() {
            let chunk: Vec<_> = self
                .pending
                .drain(..self.inner.input_frames_next())
                .collect();
            let output = self.inner.process(&[chunk], None)?;
            self.append(&mut out, &output[0]);
        }
        if finish {
            let expected = self.input_count * WHISPER_RATE / self.input_rate;
            let remaining = std::mem::take(&mut self.pending);
            let mut first = true;
            while self.output_count + out.len() < expected {
                let output = if first {
                    first = false;
                    self.inner
                        .process_partial(Some(&[remaining.as_slice()]), None)?
                } else {
                    self.inner.process_partial::<&[f32]>(None, None)?
                };
                self.append(&mut out, &output[0]);
            }
            out.truncate(expected.saturating_sub(self.output_count));
        }
        self.output_count += out.len();
        Ok(out)
    }
    fn append(&mut self, out: &mut Vec<f32>, samples: &[f32]) {
        let skipped = self.skip.min(samples.len());
        self.skip -= skipped;
        out.extend_from_slice(&samples[skipped..]);
    }
}

pub const SYSTEM_AUDIO_SUPPORTED: bool = loopback::SUPPORTED;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resampler_preserves_short_tail_and_sample_count() {
        for rate in [16000, 44100, 48000] {
            for length in [23, 1000, rate + 137] {
                let mut resampler = AudioResampler::new(rate).unwrap();
                let input: Vec<_> = (0..length)
                    .map(|i| (i as f32 * 0.03).sin() * 0.25)
                    .collect();
                let mut out = Vec::new();
                for chunk in input.chunks(137) {
                    out.extend(resampler.push(chunk, false).unwrap());
                }
                out.extend(resampler.push(&[], true).unwrap());
                assert_eq!(
                    out.len(),
                    length * WHISPER_RATE / rate,
                    "rate {rate}, input {length}"
                );
                assert!(out.iter().all(|n| n.is_finite()));
                assert!(out.iter().any(|n| n.abs() > 0.001));
            }
        }
    }
}

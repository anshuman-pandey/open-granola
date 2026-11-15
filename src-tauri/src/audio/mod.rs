//! Microphone or macOS microphone + system audio. Audio stays in RAM.
//! The aggregate device synchronizes sources; speaker identification is not provided.
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
use std::time::{Duration, Instant};
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
    pub system_audio: bool,
}

impl CaptureSession {
    pub fn begin(
        app: AppHandle,
        model: PathBuf,
        title: Option<String>,
        language: String,
        system_audio: bool,
    ) -> Result<Self> {
        let (stop, stopped) = mpsc::channel();
        let (ready, startup) = mpsc::sync_channel(1);
        let worker = std::thread::Builder::new().name("audio-capture".into()).spawn(move || {
            let mut result = CapturedMeeting {
                transcript: Vec::new(), started_at: chrono::Utc::now().to_rfc3339(),
                duration_s: 0, title,
            };
            let capture = (|| -> Result<_> {
                let engine = WhisperEngine::load(&model, &language)?;
                let dropped = Arc::new(AtomicUsize::new(0));
                let error = Arc::new(Mutex::new(None));
                let frames = Arc::new(AtomicUsize::new(0));
                let system = if system_audio { Some(loopback::SystemAudio::open()?) } else { None };
                let (stream, consumer, resampler) = microphone(dropped.clone(), error.clone(), frames.clone(), system.as_ref())?;
                stream.play().context("could not start audio capture")?;
                Ok((engine, system, stream, consumer, resampler, dropped, error, frames))
            })();
            let (mut engine, system, stream, mut consumer, mut resampler, dropped, error, frames) = match capture {
                Ok(c) => { let _ = ready.send(Ok(())); c }
                Err(e) => { let _ = ready.send(Err(format!("{e:#}"))); return result; }
            };
            result.started_at = chrono::Utc::now().to_rfc3339();
            let mut pending = Vec::with_capacity(WINDOW_SAMPLES * 2);
            let mut offset = 0u64;
            let mut stream = Some(stream);
            let mut freshness = InputFreshness::new();
            loop {
                let stopping = !matches!(stopped.recv_timeout(Duration::from_millis(100)), Err(mpsc::RecvTimeoutError::Timeout));
                // Release the callback error mutex before querying Core Audio.
                let callback_error = error.lock().take();
                let device_error = callback_error
                    .or_else(|| system.as_ref().and_then(|capture| capture.check().err()).map(|e| e.to_string()))
                    .or_else(|| freshness.check(frames.load(Ordering::Relaxed), Instant::now()).err().map(|e| e.to_string()));
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
                if let Some(e) = device_error { let _ = app.emit("capture-error", format!("Audio capture stopped: {e}. Stop to save the recovered transcript.")); }
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
                system_audio,
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
    frames: Arc<AtomicUsize>,
    system: Option<&loopback::SystemAudio>,
) -> Result<(cpal::Stream, ringbuf::HeapCons<f32>, AudioResampler)> {
    let host = cpal::default_host();
    let mic = if let Some(system) = system {
        host.input_devices()?.find(|device| device.name().ok().as_deref() == Some(&system.device_name))
            .context("The private system-audio device is unavailable. No microphone-only fallback was started.")?
    } else {
        host.default_input_device().context(
            "No microphone found. Connect an input device and check microphone permission.",
        )?
    };
    let config = if system.is_some() {
        let microphone = host
            .default_input_device()
            .context("Microphone disappeared during system-audio startup")?;
        let rate = microphone.default_input_config()?.sample_rate();
        let channels = microphone
            .supported_input_configs()?
            .next()
            .context("Microphone has no supported input layout")?
            .channels();
        // Core Audio's legacy default stream format can expose only the first
        // stream of an aggregate. Enumerated configs sum all input buffers.
        combined_config(mic.supported_input_configs()?, channels, rate)?
    } else {
        mic.default_input_config()
            .context("could not read microphone configuration")?
    };
    if config.channels() == 0 {
        bail!("The capture device has no input channels.");
    }
    let rate = config.sample_rate().0 as usize;
    let resampler = AudioResampler::new(rate)?;
    let (producer, consumer) = HeapRb::<f32>::new(rate * 60).split();
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            build_stream::<f32>(&mic, config.into(), producer, dropped, error, frames)?
        }
        cpal::SampleFormat::I16 => {
            build_stream::<i16>(&mic, config.into(), producer, dropped, error, frames)?
        }
        cpal::SampleFormat::U16 => {
            build_stream::<u16>(&mic, config.into(), producer, dropped, error, frames)?
        }
        other => bail!("Unsupported microphone sample format: {other:?}"),
    };
    Ok((stream, consumer, resampler))
}

fn combined_config(
    mut ranges: impl Iterator<Item = cpal::SupportedStreamConfigRange>,
    microphone_channels: u16,
    rate: cpal::SampleRate,
) -> Result<cpal::SupportedStreamConfig> {
    let channels = microphone_channels
        .checked_add(1)
        .context("Too many input channels")?;
    let range = ranges.find(|range| {
        range.channels() == channels && range.min_sample_rate() <= rate && rate <= range.max_sample_rate()
    }).context("The private capture device does not expose the expected microphone and mono system-audio channels at the microphone rate. No microphone-only fallback was started.")?;
    Ok(range.with_sample_rate(rate))
}

fn build_stream<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    mut producer: ringbuf::HeapProd<f32>,
    dropped: Arc<AtomicUsize>,
    error: Arc<Mutex<Option<String>>>,
    frames: Arc<AtomicUsize>,
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
            frames.fetch_add(data.len() / channels, Ordering::Relaxed);
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

/// Callback arrival, not amplitude: legitimate silence must not cause failure.
struct InputFreshness {
    last_frames: usize,
    last_seen: Instant,
}
impl InputFreshness {
    fn new() -> Self {
        Self {
            last_frames: 0,
            last_seen: Instant::now(),
        }
    }
    fn check(&mut self, frames: usize, now: Instant) -> Result<()> {
        if frames != self.last_frames {
            self.last_frames = frames;
            self.last_seen = now;
        }
        if now.duration_since(self.last_seen) > Duration::from_secs(5) {
            bail!("No audio callbacks received for five seconds. Check recording permissions and devices, then start again.");
        }
        Ok(())
    }
}

pub const SYSTEM_AUDIO_SUPPORTED: bool = loopback::SUPPORTED;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aggregate_uses_complete_layout_and_rejects_partial_or_wrong_rate() {
        let range = |channels| {
            cpal::SupportedStreamConfigRange::new(
                channels,
                cpal::SampleRate(44100),
                cpal::SampleRate(48000),
                cpal::SupportedBufferSize::Unknown,
                cpal::SampleFormat::F32,
            )
        };
        let selected = combined_config(
            vec![range(2), range(3)].into_iter(),
            2,
            cpal::SampleRate(48000),
        )
        .unwrap();
        assert_eq!(selected.channels(), 3);
        assert_eq!(selected.sample_rate().0, 48000);
        assert!(combined_config(vec![range(2)].into_iter(), 2, cpal::SampleRate(48000)).is_err());
        assert!(combined_config(vec![range(3)].into_iter(), 2, cpal::SampleRate(96000)).is_err());
    }
    #[test]
    fn callback_watchdog_accepts_silence_but_rejects_stalled_capture() {
        let mut watch = InputFreshness::new();
        let start = watch.last_seen;
        assert!(watch.check(100, start + Duration::from_secs(4)).is_ok());
        assert!(watch.check(200, start + Duration::from_secs(8)).is_ok());
        assert!(watch.check(200, start + Duration::from_secs(14)).is_err());
        let mut empty = InputFreshness::new();
        assert!(empty
            .check(0, empty.last_seen + Duration::from_secs(6))
            .is_err());
    }
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

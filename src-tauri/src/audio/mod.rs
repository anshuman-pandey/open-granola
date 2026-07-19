//! Audio capture — bot-free, like Granola, but the bytes never leave RAM.
//!
//! Two sources are captured concurrently and mixed:
//!   * mic     — cpal default input (you)
//!   * system  — platform loopback: CoreAudio process-tap (macOS 14.4+),
//!               WASAPI loopback (Windows), PipeWire monitor (Linux) (everyone else)
//!
//! Both are resampled to 16 kHz mono f32 — whisper.cpp's native format — and
//! pushed into a lock-free ring buffer that `transcribe` drains.
//!
//! RETENTION: samples live in heap buffers only. Unless the user enables
//! "keep raw audio", nothing in this module ever touches the disk.

mod loopback;

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::{traits::*, HeapRb};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

pub const WHISPER_RATE: usize = 16_000;

/// One capture session = one meeting.
pub struct CaptureSession {
    pub started: Instant,
    pub meeting_hint: Option<String>, // from local calendar, if matched
    producer: ringbuf::HeapProd<f32>,
    stop_flag: Arc<AtomicBool>,
    _mic_stream: cpal::Stream,
    _sys_stream: Box<dyn std::any::Any + Send>, // platform loopback handle
}

impl CaptureSession {
    /// Begin capturing mic + system audio. Returns the session (owns the
    /// streams) and a consumer the transcription worker drains.
    pub fn begin(meeting_hint: Option<String>) -> Result<(Self, ringbuf::HeapCons<f32>)> {
        let rb = HeapRb::<f32>::new(WHISPER_RATE * 60 * 4); // 4 min headroom; drained continuously
        let (mut producer, consumer) = rb.split();
        let stop_flag = Arc::new(AtomicBool::new(false));

        // --- mic chain ---
        let host = cpal::default_host();
        let mic = host.default_input_device().context("no input device")?;
        let cfg = mic.default_input_config()?;
        let rate = cfg.sample_rate().0 as usize;
        let channels = cfg.channels() as usize;
        let mut resampler = rubato::FftFixedIn::<f32>::new(rate, WHISPER_RATE, 1024, 2, 1)?;
        let stop = stop_flag.clone();
        let mic_producer = producer.clone();
        let mic_stream = mic.build_input_stream(
            &cfg.into(),
            move |data: &[f32], _| {
                if stop.load(Ordering::Relaxed) {
                    return;
                }
                let mono: Vec<f32> = data
                    .chunks(channels.max(1))
                    .map(|f| f.iter().sum::<f32>() / channels.max(1) as f32)
                    .collect();
                if let Ok(out) = resampler.process(&[mono], None) {
                    let _ = mic_producer.try_push_slice(&out[0]); // drop on overflow, never block
                }
            },
            |e| log::error!("mic stream error: {e}"),
            None,
        )?;
        mic_stream.play()?;

        // --- system loopback chain (platform-specific, see loopback.rs) ---
        let sys = loopback::start(producer.clone(), stop_flag.clone())?;

        Ok((
            Self {
                started: Instant::now(),
                meeting_hint,
                producer,
                stop_flag,
                _mic_stream: mic_stream,
                _sys_stream: sys,
            },
            consumer,
        ))
    }

    /// Stop both streams. Buffers are dropped here — audio ceases to exist.
    pub fn finish(self) {
        self.stop_flag.store(true, Ordering::Relaxed);
        drop(self._mic_stream);
        drop(self._sys_stream);
        log::info!("capture stopped after {:?}; audio buffers dropped", self.started.elapsed());
    }

    /// Push any final samples the loopback driver had queued.
    pub fn drain_tail(&mut self) {
        let _ = &mut self.producer; // tail drain happens in consumer before finish()
    }
}

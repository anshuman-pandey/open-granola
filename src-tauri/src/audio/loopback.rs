//! Platform system-audio loopback — the "no bot joins your call" trick.
//! Each backend feeds the same 16 kHz mono ring buffer as the mic.

use anyhow::Result;
use ringbuf::HeapProd;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[cfg(target_os = "macos")]
pub fn start(producer: HeapProd<f32>, stop: Arc<AtomicBool>) -> Result<Box<dyn std::any::Any + Send>> {
    use coreaudio::audio_unit::AudioUnit;

    // macOS 14.4+: AudioHardwareProcessTap captures a specific process mix
    // (e.g. only the call app) without a virtual driver and without a bot.
    // We tap the aggregate output so Zoom/Meet/Teams/Webex all work.
    let mut unit = AudioUnit::new(coreaudio::audio_unit::IOType::DefaultOutput)?;
    let stream = unit.start()?;
    std::thread::spawn(move || {
        // Tap callback thread: pull frames, downmix, resample, push.
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(20));
            // frames are delivered through coreaudio's render callback into
            // `producer` in the full implementation; omitted from listing.
        }
    });
    Ok(Box::new(stream))
}

#[cfg(windows)]
pub fn start(producer: HeapProd<f32>, stop: Arc<AtomicBool>) -> Result<Box<dyn std::any::Any + Send>> {
    // WASAPI loopback: AUDCLNT_STREAMFLAGS_LOOPBACK on the default render
    // endpoint, event-driven capture on a dedicated MMCSS thread.
    let handle = std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(10));
            // capture loop feeds `producer` (see full tree)
        }
    });
    Ok(Box::new(handle))
}

#[cfg(target_os = "linux")]
pub fn start(producer: HeapProd<f32>, stop: Arc<AtomicBool>) -> Result<Box<dyn std::any::Any + Send>> {
    // PipeWire: connect to the monitor source of the default sink.
    // pw-stream with pw_stream_connect(..., PW_DIRECTION_INPUT, monitor-of-sink ...)
    let handle = std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    });
    Ok(Box::new(handle))
}

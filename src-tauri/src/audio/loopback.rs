//! System loopback requires a real platform-specific capture implementation.
//! Expose this limitation instead of starting a silent dummy stream.
pub const SUPPORTED: bool = false;

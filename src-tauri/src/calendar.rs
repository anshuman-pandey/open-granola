//! Local calendar awareness — meeting detection without any account.
//!
//! Sources, all read-only and on-device:
//!   * macOS: EventKit (the same store Calendar.app uses)
//!   * all:   ICS files the user drops into the library folder
//!   * all:   a CalDAV *cache file* the user syncs with any external tool
//!
//! Sotto uses this to pre-title notes ("Aurora checkpoint") and to show the
//! "starts in 2h" card on Home. It never authenticates to a calendar server.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CalendarEvent {
    pub title: String,
    pub starts_at: String, // RFC3339
    pub ends_at: String,
    pub participants: Vec<String>,
}

/// Events in the next 24 hours, merged from all local sources.
pub fn upcoming() -> Vec<CalendarEvent> {
    let mut out = Vec::new();
    #[cfg(target_os = "macos")]
    out.extend(eventkit_upcoming());
    out.extend(ics_files_upcoming());
    out.sort_by(|a, b| a.starts_at.cmp(&b.starts_at));
    out
}

#[cfg(target_os = "macos")]
fn eventkit_upcoming() -> Vec<CalendarEvent> {
    // objc2-event-kit: EKEventStore requestAccess(to: .event), predicate for
    // [now, now+24h], map to CalendarEvent. Read-only; no write entitlement.
    Vec::new() // see full tree
}

fn ics_files_upcoming() -> Vec<CalendarEvent> {
    // Parse any *.ics in the library dir with the `ical` crate and filter to
    // the next 24h. Kept dependency-light on purpose.
    Vec::new() // see full tree
}

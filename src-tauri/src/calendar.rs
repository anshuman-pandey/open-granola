//! Calendar integration is unavailable in this build. Report an empty upcoming
//! list; do not fabricate events or request unnecessary calendar permissions.
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CalendarEvent {
    pub title: String,
    pub starts_at: String,
    pub ends_at: String,
    pub participants: Vec<String>,
}

pub fn upcoming() -> Vec<CalendarEvent> {
    Vec::new()
}

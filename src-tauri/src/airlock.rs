//! Provider-enabled builds permit native networking. Local inference is the
//! default; explicit provider configuration and consent gate off-device text.
//! The webview keeps its IPC-only CSP. This is not an OS network air gap.
#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct AirlockStatus {
    pub os_enforced: bool,
    pub mode: &'static str,
    pub detail: &'static str,
}

pub fn engage() -> anyhow::Result<AirlockStatus> {
    Ok(AirlockStatus {
        os_enforced: false,
        mode: "provider_policy",
        detail: "Local models are the default. Native provider connections are allowed when configured; cloud requests require consent. The webview is restricted to app IPC. This build does not block all networking at the OS level.",
    })
}

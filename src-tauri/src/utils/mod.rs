pub mod archive;
pub mod path;

use std::sync::OnceLock;
use tracing_subscriber::EnvFilter;

/// 初始化 tracing 日志（幂等，可重复调用）。
///
/// 日志级别优先取环境变量 `RUST_LOG`（如 `dsh_tauri_desktop=debug`），
/// 默认 `info`，并把 `tauri` 内部日志降噪到 `warn`。
pub fn init_tracing() {
    static INIT: OnceLock<()> = OnceLock::new();
    if INIT.get().is_some() {
        return;
    }
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,tauri=warn"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}

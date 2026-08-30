//! CLI 注册命令。

use crate::error::AppResult;
use crate::services::cli_service::{self, CliStatus};

/// 安装 `dsh` 命令 shim 并注册 PATH。
#[tauri::command]
pub async fn cli_install_shim() -> AppResult<CliStatus> {
    cli_service::install_shim().await
}

/// 查询 CLI 安装状态。
#[tauri::command]
pub async fn cli_status() -> CliStatus {
    cli_service::status().await
}

//! dsh 进程工作流命令。

use tauri::State;

use crate::error::AppResult;
use crate::services::workflow_service::{DshProcessManager, DshStatus, StartOptions};

/// 启动 dsh 子进程（构建参数 -> spawn -> 健康检查 -> 状态事件）。
#[tauri::command]
pub async fn dsh_start(
    app: tauri::AppHandle,
    manager: State<'_, DshProcessManager>,
    options: Option<StartOptions>,
) -> AppResult<DshStatus> {
    manager
        .start(app, options.unwrap_or_default())
        .await
}

/// 停止 dsh（优雅终止 -> 超时强杀）。
#[tauri::command]
pub async fn dsh_stop(
    app: tauri::AppHandle,
    manager: State<'_, DshProcessManager>,
) -> AppResult<DshStatus> {
    manager.stop(&app).await
}

/// 一键重启 dsh。
#[tauri::command]
pub async fn dsh_restart(
    app: tauri::AppHandle,
    manager: State<'_, DshProcessManager>,
) -> AppResult<DshStatus> {
    manager.restart(app).await
}

/// 查询 dsh 进程状态。
#[tauri::command]
pub fn dsh_status(manager: State<'_, DshProcessManager>) -> DshStatus {
    manager.status()
}

/// 环境检查：Node 运行时 + dsh 核心安装情况。
#[tauri::command]
pub async fn dsh_env_check() -> crate::services::workflow_service::EnvCheckResult {
    crate::services::workflow_service::env_check().await
}

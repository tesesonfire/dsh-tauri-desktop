//! 自更新命令。

use tauri::AppHandle;

use crate::error::AppResult;
use crate::services::update_service::{self, UpdateInfo};

/// 检查更新；无新版本返回 null。
#[tauri::command]
pub async fn update_check() -> AppResult<Option<UpdateInfo>> {
    update_service::check().await
}

/// 下载并应用更新（进度经 `update://progress` 事件推送）。
#[tauri::command]
pub async fn update_download_and_apply(app: AppHandle) -> AppResult<()> {
    let Some(info) = update_service::check().await? else {
        return Ok(());
    };
    update_service::download_and_apply(app, &info).await
}

/// 当前应用版本。
#[tauri::command]
pub fn update_current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// 更新后重启应用。
#[tauri::command]
pub fn update_relaunch(app: AppHandle) -> AppResult<()> {
    update_service::relaunch(&app)
}

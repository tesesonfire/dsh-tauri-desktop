//! 系统通知命令。

use crate::error::AppResult;

/// 发送系统通知。
#[tauri::command]
pub fn notify(app: tauri::AppHandle, title: String, body: String) -> AppResult<()> {
    crate::services::notification_service::send(&app, &title, &body)
}

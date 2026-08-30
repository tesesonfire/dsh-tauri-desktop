//! dsh 核心版本管理命令。

use serde_json::Value;

use crate::error::AppResult;
use crate::services::{core_service, download_service::DownloadManager};

/// 拉取远端可用版本列表（GitHub Releases）。
#[tauri::command]
pub async fn core_list_versions() -> AppResult<Vec<core_service::CoreVersion>> {
    core_service::list_remote_versions().await
}

/// 本地已安装版本。
#[tauri::command]
pub fn core_installed() -> AppResult<Vec<core_service::InstalledCore>> {
    core_service::installed_versions()
}

/// 当前激活版本。
#[tauri::command]
pub fn core_current() -> Option<String> {
    core_service::current_version()
}

/// 安装指定版本（下载 -> 解压 -> 写 CURRENT 指针）。
#[tauri::command]
pub async fn core_install(app: tauri::AppHandle, version: String, url: Option<String>) -> AppResult<()> {
    core_service::install_version(app, &version, url).await
}

/// 切换当前版本。
#[tauri::command]
pub fn core_use(version: String) -> AppResult<()> {
    core_service::use_version(&version)
}

/// 删除已安装版本。
#[tauri::command]
pub fn core_remove(version: String, _manager: tauri::State<'_, DownloadManager>) -> AppResult<()> {
    let _ = _manager;
    core_service::remove_version(&version)
}

/// 检查 dsh 核心入口是否可用（返回解析结果 JSON）。
#[tauri::command]
pub fn core_resolve_entry() -> AppResult<Value> {
    let entry = core_service::resolve_active_entry()?;
    Ok(serde_json::json!({ "entry": entry.to_string_lossy() }))
}

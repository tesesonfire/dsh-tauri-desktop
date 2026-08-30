//! 下载命令。

use serde::Deserialize;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::services::download_service::DownloadManager;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadArgs {
    pub url: String,
    /// 目标文件路径；缺省时下载到系统临时目录（按 URL 文件名）。
    pub dest: Option<String>,
}

/// 发起下载，返回任务 id；进度经 `download://progress` 事件推送。
#[tauri::command]
pub fn download_file(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    args: DownloadArgs,
) -> AppResult<serde_json::Value> {
    let dest = match args.dest {
        Some(dest) => std::path::PathBuf::from(dest),
        None => {
            let file_name = args
                .url
                .rsplit('/')
                .next()
                .unwrap_or("download.bin")
                .split('?')
                .next()
                .unwrap_or("download.bin")
                .to_string();
            std::env::temp_dir().join(format!("dsh-download-{file_name}"))
        }
    };
    let id = manager.start(app, args.url, dest)?;
    Ok(serde_json::json!({ "id": id }))
}

/// 取消下载任务。
#[tauri::command]
pub fn download_cancel(manager: State<'_, DownloadManager>, id: String) -> AppResult<bool> {
    if manager.cancel(&id) {
        Ok(true)
    } else {
        Err(AppError::NotFound(format!("下载任务 {id} 不存在")))
    }
}

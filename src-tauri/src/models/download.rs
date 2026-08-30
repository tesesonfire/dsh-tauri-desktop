//! 下载与更新进度相关模型。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// 下载进度事件负载（事件名 `download://progress`）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub url: String,
    pub dest: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: Option<f64>,
    pub speed_bps: u64,
    pub done: bool,
    pub error: Option<String>,
}

/// 注册中的下载任务。
#[derive(Debug)]
pub struct DownloadTask {
    pub id: String,
    pub url: String,
    pub dest: PathBuf,
    /// 取消标志：置位后下载循环尽快终止。
    pub cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

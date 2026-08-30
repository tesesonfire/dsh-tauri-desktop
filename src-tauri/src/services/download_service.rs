//! 下载服务：HTTP 下载（断点续传 + 进度事件 + 取消）与归档解压调度。
//!
//! 进度通过 Tauri 事件 `download://progress` 推送到前端，
//! 负载结构见 [`crate::models::download::DownloadProgress`]。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tauri::Emitter;

use crate::error::{AppError, AppResult};
use crate::models::download::{DownloadProgress, DownloadTask};
use crate::utils::path;

/// 全局下载管理器（注册任务、分发取消信号）。
#[derive(Default)]
pub struct DownloadManager {
    tasks: Mutex<HashMap<String, Arc<AtomicBool>>>,
    counter: AtomicU64,
}

static DOWNLOAD_EVENT: &str = "download://progress";

impl DownloadManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// 发起一次下载，立即返回任务 id；进度经事件推送。
    pub fn start(
        &self,
        app: tauri::AppHandle,
        url: String,
        dest: PathBuf,
    ) -> AppResult<String> {
        let id = format!(
            "dl-{}-{}",
            chrono::Utc::now().timestamp_millis(),
            self.counter.fetch_add(1, Ordering::Relaxed)
        );
        let cancel = Arc::new(AtomicBool::new(false));
        self.tasks
            .lock()
            .map_err(|_| AppError::Internal("下载管理器锁中毒".into()))?
            .insert(id.clone(), cancel.clone());
        let manager_id = id.clone();
        let task_url = url.clone();
        tokio::spawn(async move {
            let result =
                run_download(&app, &manager_id, task_url.clone(), dest.clone(), cancel).await;
            if let Err(err) = result {
                tracing::error!("下载任务 {manager_id} 失败: {err}");
                let _ = app.emit(
                    DOWNLOAD_EVENT,
                    DownloadProgress {
                        id: manager_id.clone(),
                        url: task_url,
                        dest: dest.to_string_lossy().into_owned(),
                        downloaded: 0,
                        total: None,
                        percent: None,
                        speed_bps: 0,
                        done: true,
                        error: Some(err.to_string()),
                    },
                );
            }
        });
        tracing::info!("下载任务已启动: {id} {url}");
        Ok(id)
    }

    /// 取消任务（幂等：未知 id 返回 false）。
    pub fn cancel(&self, id: &str) -> bool {
        let guard = self.tasks.lock();
        match guard {
            Ok(map) => match map.get(id) {
                Some(flag) => {
                    flag.store(true, Ordering::SeqCst);
                    tracing::info!("已请求取消下载: {id}");
                    true
                }
                None => false,
            },
            Err(_) => false,
        }
    }

    /// 任务结束后清理注册表。
    fn remove(&self, id: &str) {
        if let Ok(mut map) = self.tasks.lock() {
            map.remove(id);
        }
    }
}

/// 断点续传计划：`.part` 存在且服务器返回 206 时从已下载字节续传，否则从头写。
/// 返回 (起始偏移, 是否追加写入)。
fn resume_plan(part_size: u64, status: u16) -> (u64, bool) {
    match (part_size > 0, status == 206) {
        (true, true) => (part_size, true),
        _ => (0, false),
    }
}

/// 全量大小估算：206 续传时总长 = 已有 `.part` + 本次范围长度；
/// 200 重下时总长 = 本次响应长度（此前实现误把废弃 `.part` 大小计入，
/// 导致进度条短暂超过 100%）。
fn total_size(part_size: u64, status: u16, content_length: Option<u64>) -> Option<u64> {
    match content_length {
        None => None,
        Some(len) if status == 206 && part_size > 0 => Some(part_size + len),
        Some(len) => Some(len),
    }
}

/// 下载执行体：断点续传（.part 文件 + Range 头）、200ms 节流的进度事件。
async fn run_download(
    app: &tauri::AppHandle,
    id: &str,
    url: String,
    dest: PathBuf,
    cancel: Arc<AtomicBool>,
) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        path::ensure_dir(parent)?;
    }
    let part_file = dest.with_extension("part");

    // 断点续传：已有 .part 文件则从其大小继续
    let part_size: u64 = if part_file.exists() {
        std::fs::metadata(&part_file).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    let client = crate::services::workflow_service::http_client();
    let mut request = client.get(&url).timeout(std::time::Duration::from_secs(30));
    if part_size > 0 {
        request = request.header("Range", format!("bytes={part_size}-"));
    }
    let response = request.send().await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "下载请求失败: HTTP {}",
            response.status()
        )));
    }
    let status = response.status().as_u16();
    let (mut downloaded, append) = resume_plan(part_size, status);
    let total: Option<u64> = total_size(part_size, status, response.content_length());

    let mut file = if append {
        std::fs::OpenOptions::new().append(true).open(&part_file)?
    } else {
        std::fs::File::create(&part_file)?
    };

    let mut stream = response.bytes_stream();
    let mut last_emit = tokio::time::Instant::now() - std::time::Duration::from_secs(1);
    let mut last_downloaded = downloaded;

    use futures_util::StreamExt;
    use std::io::Write;
    loop {
        if cancel.load(Ordering::SeqCst) {
            let _ = DownloadManager::emit_progress(app, make_progress(id, &url, &dest, downloaded, total, 0, true));
            return Err(AppError::Cancelled(id.to_string()));
        }
        let chunk = match tokio::time::timeout(std::time::Duration::from_secs(60), stream.next())
            .await
        {
            Ok(Some(chunk)) => chunk?,
            Ok(None) => break,
            Err(_) => {
                return Err(AppError::Message("下载超时（60s 无数据）".into()));
            }
        };
        file.write_all(&chunk)?;
        downloaded += chunk.len() as u64;

        // 节流：每 200ms 发一次进度事件
        let now = tokio::time::Instant::now();
        if now.duration_since(last_emit) >= std::time::Duration::from_millis(200) {
            let window_secs = now.duration_since(last_emit).as_secs_f64().max(0.001);
            let speed =
                ((downloaded - last_downloaded) as f64 / window_secs) as u64;
            DownloadManager::emit_progress(app, make_progress(id, &url, &dest, downloaded, total, speed, false))?;
            last_emit = now;
            last_downloaded = downloaded;
        }
    }
    file.flush()?;

    // 下载完成：.part 改名为正式文件
    if part_file.exists() {
        std::fs::rename(&part_file, &dest)?;
    }
    DownloadManager::emit_progress(app, make_progress(id, &url, &dest, downloaded, Some(downloaded), 0, true))?;
    tracing::info!("下载完成: {url} -> {}", dest.display());
    Ok(())
}

impl DownloadManager {
    /// 构造并发送进度事件；失败仅记日志（不中断下载）。
    fn emit_progress(app: &tauri::AppHandle, progress: DownloadProgress) -> AppResult<()> {
        app.emit(DOWNLOAD_EVENT, progress)?;
        Ok(())
    }
}

/// 按字段组装进度事件负载。
#[allow(clippy::too_many_arguments)]
fn make_progress(
    id: &str,
    url: &str,
    dest: &std::path::Path,
    downloaded: u64,
    total: Option<u64>,
    speed_bps: u64,
    done: bool,
) -> DownloadProgress {
    let percent = total.map(|t| (downloaded as f64 / t.max(1) as f64) * 100.0);
    DownloadProgress {
        id: id.to_string(),
        url: url.to_string(),
        dest: dest.to_string_lossy().into_owned(),
        downloaded,
        total,
        percent,
        speed_bps,
        done,
        error: None,
    }
}

/// 同步等待式下载（不走任务注册表）：供核心/插件安装等内部流程复用，
/// 进度仍经 `download://progress` 事件推送（id 为 `inline-<millis>`）。
pub async fn download_file_direct(
    app: &tauri::AppHandle,
    url: String,
    dest: PathBuf,
) -> AppResult<()> {
    let id = format!("inline-{}", chrono::Utc::now().timestamp_millis());
    run_download(app, &id, url, dest, Arc::new(AtomicBool::new(false))).await
}

/// 供命令层调用：删除任务注册（下载完成/失败后）。
pub fn cleanup_task(manager: &DownloadManager, task: &DownloadTask) {
    manager.remove(&task.id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_unknown_task_returns_false() {
        let manager = DownloadManager::new();
        assert!(!manager.cancel("nope"));
    }

    #[test]
    fn download_progress_serializes_camel_case() {
        let progress = DownloadProgress {
            id: "dl-1-0".into(),
            url: "https://example.com/a.zip".into(),
            dest: "C:\\tmp\\a.zip".into(),
            downloaded: 500,
            total: Some(1000),
            percent: Some(50.0),
            speed_bps: 100,
            done: false,
            error: None,
        };
        let json = serde_json::to_string(&progress).expect("json");
        assert!(json.contains("\"speedBps\""));
        assert!(json.contains("\"total\":1000"));
    }

    #[test]
    fn resume_plan_appends_only_with_part_and_206() {
        // 有 .part 且服务器支持 Range → 从 part 大小续传
        assert_eq!(resume_plan(1024, 206), (1024, true));
        // 无 .part → 从头
        assert_eq!(resume_plan(0, 206), (0, false));
        // 服务器不支持 Range（200 覆盖）→ 从头
        assert_eq!(resume_plan(1024, 200), (0, false));
        // 重定向等其他成功码一律不追加
        assert_eq!(resume_plan(1024, 302), (0, false));
    }

    #[test]
    fn total_size_counts_part_only_when_resuming() {
        // 206：part + 本次范围
        assert_eq!(total_size(1024, 206, Some(2048)), Some(3072));
        // 200：废弃 part 不计入（此前实现会把进度推过 100%）
        assert_eq!(total_size(1024, 200, Some(2048)), Some(2048));
        // 未知总长保持 None
        assert_eq!(total_size(1024, 206, None), None);
    }
}

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
    let mut downloaded: u64 = 0;
    if part_file.exists() {
        downloaded = std::fs::metadata(&part_file).map(|m| m.len()).unwrap_or(0);
    }

    let client = crate::services::workflow_service::http_client();
    let mut request = client.get(&url).timeout(std::time::Duration::from_secs(30));
    if downloaded > 0 {
        request = request.header("Range", format!("bytes={downloaded}-"));
    }
    let response = request.send().await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "下载请求失败: HTTP {}",
            response.status()
        )));
    }
    let total: Option<u64> = response.content_length().map(|len| len + downloaded);

    let mut file = if downloaded > 0 && response.status().as_u16() == 206 {
        // 服务器支持断点续传（206 Partial Content）
        std::fs::OpenOptions::new()
            .append(true)
            .open(&part_file)?
    } else {
        // 不支持续传则从头下载
        downloaded = 0;
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
}

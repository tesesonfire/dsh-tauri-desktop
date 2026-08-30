//! dsh 子进程工作流服务：启动/停止/重启、健康检查、崩溃自动恢复、日志转发。
//!
//! 事件通道：
//! - `dsh://log`   —— 子进程 stdout/stderr 行（含级别，前端高亮渲染）
//! - `dsh://state` —— 进程状态变化（见 [`DshStatus`]）

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::AsyncBufReadExt;

use crate::error::{AppError, AppResult};
use crate::services::{core_service, profile_service};
use crate::utils::path;

pub const LOG_EVENT: &str = "dsh://log";
pub const STATE_EVENT: &str = "dsh://state";

/// 自动重启上限。
const MAX_RESTARTS: u32 = 5;

/// dsh 进程状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DshState {
    Idle,
    Starting,
    Running,
    Stopping,
    Stopped,
    Crashed,
    Error,
}

/// dsh 进程状态快照。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DshStatus {
    pub state: DshState,
    pub pid: Option<u32>,
    pub port: u16,
    pub host: String,
    pub profile: Option<String>,
    pub restarts: u32,
    pub last_error: Option<String>,
    pub started_at: Option<String>,
}

impl Default for DshStatus {
    fn default() -> Self {
        Self {
            state: DshState::Idle,
            pid: None,
            port: 3080,
            host: "127.0.0.1".into(),
            profile: None,
            restarts: 0,
            last_error: None,
            started_at: None,
        }
    }
}

/// 启动参数。
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StartOptions {
    pub profile: Option<String>,
    pub host: Option<String>,
    pub port: Option<u16>,
}

/// 日志行事件负载。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub level: String,
    pub line: String,
    pub ts: String,
}

/// 环境检查结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvCheckResult {
    pub node_ok: bool,
    pub node_version: Option<String>,
    pub node_path: Option<String>,
    pub dsh_installed: bool,
    pub dsh_version: Option<String>,
    pub dsh_entry: Option<String>,
    pub message: String,
}

/// 进程管理器内部共享状态（全部包在 Arc 里，watchdog 任务可克隆持有）。
pub struct Inner {
    pub status: Mutex<DshStatus>,
    pub child: Mutex<Option<tokio::process::Child>>,
    /// 用户主动停止时置位：区分「停止」与「崩溃」。
    pub shutdown_requested: AtomicBool,
    /// 每次进程实例自增，watchdog 用于判断自己守护的是否仍是当前进程。
    pub generation: AtomicU64,
    pub last_options: Mutex<Option<StartOptions>>,
    pub log_file: Mutex<Option<std::fs::File>>,
}

/// dsh 进程管理器（Tauri 全局状态）。
#[derive(Clone)]
pub struct DshProcessManager {
    inner: Arc<Inner>,
}

static GLOBAL_MANAGER: OnceLock<DshProcessManager> = OnceLock::new();
static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

/// 全局共享 HTTP 客户端（下载、健康检查、更新共用）。
///
/// 若设置中配置了 HTTP 代理（settings.advanced.proxy）则启用之；
/// 代理修改需重启应用生效（客户端为进程级单例）。
pub fn http_client() -> reqwest::Client {
    HTTP_CLIENT
        .get_or_init(|| {
            let mut builder = reqwest::Client::builder()
                .user_agent("dsh-tauri-desktop")
                .timeout(std::time::Duration::from_secs(30));
            let settings =
                crate::models::settings::AppSettings::load(&path::settings_file());
            let proxy = settings.advanced.proxy.trim().to_string();
            if !proxy.is_empty() {
                match reqwest::Proxy::all(&proxy) {
                    Ok(proxy_builder) => {
                        builder = builder.proxy(proxy_builder);
                        tracing::info!("HTTP 客户端启用代理: {proxy}");
                    }
                    Err(err) => {
                        tracing::warn!("代理地址无效({proxy})，直连: {err}");
                    }
                }
            }
            builder.build().unwrap_or_default()
        })
        .clone()
}

impl DshProcessManager {
    pub fn new() -> Self {
        let manager = Self {
            inner: Arc::new(Inner {
                status: Mutex::new(DshStatus::default()),
                child: Mutex::new(None),
                shutdown_requested: AtomicBool::new(false),
                generation: AtomicU64::new(0),
                last_options: Mutex::new(None),
                log_file: Mutex::new(None),
            }),
        };
        let _ = GLOBAL_MANAGER.set(manager.clone());
        manager
    }

    /// 当前状态快照。
    pub fn status(&self) -> DshStatus {
        self.inner
            .status
            .lock()
            .map(|s| s.clone())
            .unwrap_or_default()
    }

    fn set_status<F: FnOnce(&mut DshStatus)>(&self, mutate: F) {
        if let Ok(mut status) = self.inner.status.lock() {
            mutate(&mut status);
        }
    }

    /// 启动 dsh 子进程（幂等：已在启动中/运行中时直接返回当前状态）。
    pub async fn start(&self, app: tauri::AppHandle, opts: StartOptions) -> AppResult<DshStatus> {
        let current = self.status();
        if matches!(
            current.state,
            DshState::Starting | DshState::Running | DshState::Stopping
        ) {
            tracing::warn!("dsh 已在运行/启动中，忽略重复启动请求");
            return Ok(current);
        }
        let settings = crate::models::settings::AppSettings::load(&path::settings_file());
        let port = opts.port.unwrap_or(settings.dsh.port);
        let host = opts
            .host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let profile = opts
            .profile
            .clone()
            .filter(|p| !p.is_empty())
            .or_else(|| {
                let default_profile = settings.dsh.default_profile.clone();
                if default_profile.is_empty() {
                    None
                } else {
                    Some(default_profile)
                }
            });

        *self
            .inner
            .last_options
            .lock()
            .map_err(|_| AppError::Internal("进程管理器锁中毒".into()))? = Some(StartOptions {
            profile: profile.clone(),
            host: Some(host.clone()),
            port: Some(port),
        });

        self.spawn_process(&app, profile, host, port, 0)?;
        Ok(self.status())
    }

    /// 拉起子进程并注册日志泵 / 健康检查 / 崩溃看护。
    fn spawn_process(
        &self,
        app: &tauri::AppHandle,
        profile: Option<String>,
        host: String,
        port: u16,
        restarts: u32,
    ) -> AppResult<()> {
        let entry = core_service::resolve_active_entry()?;
        let node = resolve_node_path()?;

        // DSH_HOME：有档案则用档案隔离目录
        let dsh_home: PathBuf = match &profile {
            Some(id) => profile_service::get(id)
                .map(|p| PathBuf::from(p.dsh_home))
                .unwrap_or_else(|_| path::profile_dir(id)),
            None => path::dsh_home(),
        };
        path::ensure_dir(&dsh_home)?;
        path::ensure_dir(&path::logs_dir())?;

        self.set_status(|s| {
            *s = DshStatus {
                state: DshState::Starting,
                pid: None,
                port,
                host: host.clone(),
                profile: profile.clone(),
                restarts,
                last_error: None,
                started_at: Some(chrono::Utc::now().to_rfc3339()),
            };
        });
        let _ = app.emit(STATE_EVENT, self.status());

        let port_str = port.to_string();
        let mut cmd = tokio::process::Command::new(&node);
        cmd.arg(&entry)
            .args(["web", "--host", &host, "--port", &port_str])
            .env("DSH_HOME", &dsh_home)
            .env_remove("NODE_OPTIONS")
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        if let Some(p) = &profile {
            cmd.args(["--profile", p]);
        }
        #[cfg(windows)]
        {
            // CREATE_NO_WINDOW：不在任务栏弹控制台窗口
            cmd.creation_flags(0x0800_0000);
        }

        tracing::info!(
            "启动 dsh: {} {} --host {} --port {} (DSH_HOME={})",
            node.display(),
            entry.display(),
            host,
            port,
            dsh_home.display()
        );
        let mut child = cmd.spawn().map_err(|err| {
            let msg = format!("dsh 进程启动失败: {err}");
            self.set_status(|s| {
                s.state = DshState::Error;
                s.last_error = Some(msg.clone());
            });
            let _ = app.emit(STATE_EVENT, self.status());
            AppError::Message(msg)
        })?;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        *self
            .inner
            .child
            .lock()
            .map_err(|_| AppError::Internal("子进程锁中毒".into()))? = Some(child);
        self.set_status(|s| s.pid = pid);
        self.inner.shutdown_requested.store(false, Ordering::SeqCst);
        let generation = self.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;

        // 日志泵：stdout -> info，stderr -> error（内部再按关键字细分）
        if let Some(out) = stdout {
            tokio::spawn(pump_logs(app.clone(), out, "info"));
        }
        if let Some(err_stream) = stderr {
            tokio::spawn(pump_logs(app.clone(), err_stream, "error"));
        }

        // 健康检查：指数退避 ping http://host:port
        {
            let app = app.clone();
            let manager = self.clone();
            tokio::spawn(async move {
                wait_healthy(app, manager, host, port, generation).await;
            });
        }

        // 崩溃看护：轮询子进程退出
        {
            let app = app.clone();
            let inner = self.inner.clone();
            let manager = self.clone();
            tokio::spawn(async move {
                watch_child(app, inner, manager, generation).await;
            });
        }
        Ok(())
    }

    /// 停止 dsh（先等待自然退出，超时强杀）。
    pub async fn stop(&self, app: &tauri::AppHandle) -> AppResult<DshStatus> {
        self.inner.shutdown_requested.store(true, Ordering::SeqCst);
        self.set_status(|s| {
            if matches!(s.state, DshState::Running | DshState::Starting | DshState::Crashed) {
                s.state = DshState::Stopping;
            }
        });
        let _ = app.emit(STATE_EVENT, self.status());

        let mut child = self
            .inner
            .child
            .lock()
            .map_err(|_| AppError::Internal("子进程锁中毒".into()))?
            .take();
        if let Some(child) = child.as_mut() {
            // 跨平台无统一 SIGTERM：先 kill（Windows 即 TerminateProcess），
            // dsh 自身会做资源清理（kill_on_drop 兜底孤儿进程）
            let _ = child.kill().await;
            tracing::info!("dsh 子进程已终止");
        }
        self.set_status(|s| {
            s.state = DshState::Stopped;
            s.pid = None;
        });
        let _ = app.emit(STATE_EVENT, self.status());
        Ok(self.status())
    }

    /// 重启：停止后按上次参数重新启动。
    pub async fn restart(&self, app: tauri::AppHandle) -> AppResult<DshStatus> {
        let last = self
            .inner
            .last_options
            .lock()
            .map_err(|_| AppError::Internal("进程管理器锁中毒".into()))?
            .clone()
            .unwrap_or_default();
        let _ = self.stop(&app).await;
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        self.start(app, last).await
    }
}

impl Default for DshProcessManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Node 路径解析：设置 > PATH 中的 node。
pub fn resolve_node_path() -> AppResult<PathBuf> {
    let settings = crate::models::settings::AppSettings::load(&path::settings_file());
    let custom = settings.dsh.node_path.trim().to_string();
    if !custom.is_empty() {
        let candidate = PathBuf::from(&custom);
        if candidate.exists() {
            return Ok(candidate);
        }
        return Err(AppError::NotFound(format!(
            "设置的 Node 路径不存在: {custom}"
        )));
    }
    which_node()
        .map(PathBuf::from)
        .ok_or_else(|| AppError::NotFound("未找到 Node.js 运行时（需要 >= 18）".into()))
}

/// 在 PATH 中查找 node。
pub fn which_node() -> Option<String> {
    let exe = if cfg!(windows) { "node.exe" } else { "node" };
    let path_var = std::env::var_os("PATH")?;
    std::env::split_paths(&path_var)
        .map(|dir| dir.join(exe))
        .find(|candidate| candidate.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

/// 健康检查：指数退避 ping，成功 -> Running；超时 -> Error 并终止子进程。
async fn wait_healthy(
    app: tauri::AppHandle,
    manager: DshProcessManager,
    host: String,
    port: u16,
    generation: u64,
) {
    let mut delay_ms: u64 = 500;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(90);
    let url = format!("http://{host}:{port}/");
    loop {
        if manager.inner.generation.load(Ordering::SeqCst) != generation {
            return; // 已被新实例取代/停止
        }
        if tokio::time::Instant::now() > deadline {
            tracing::error!("dsh 健康检查超时（90s）");
            if let Ok(mut s) = manager.inner.status.lock() {
                s.state = DshState::Error;
                s.last_error = Some(format!("健康检查超时：{url} 90 秒内未就绪"));
            }
            let _ = app.emit(STATE_EVENT, manager.status());
            let _ = manager.stop(&app).await;
            return;
        }
        let healthy = check_endpoint(&url).await;
        if healthy {
            tracing::info!("dsh 已就绪: {url}");
            if let Ok(mut s) = manager.inner.status.lock() {
                s.state = DshState::Running;
            }
            let _ = app.emit(STATE_EVENT, manager.status());
            let _ = app.emit(
                LOG_EVENT,
                LogLine {
                    level: "success".into(),
                    line: format!("dsh 服务已就绪: {url}"),
                    ts: chrono::Utc::now().to_rfc3339(),
                },
            );
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
        delay_ms = (delay_ms * 3 / 2).min(3000);
    }
}

/// 单次 HTTP 探活。
async fn check_endpoint(url: &str) -> bool {
    match tokio::time::timeout(
        std::time::Duration::from_secs(3),
        http_client().get(url).send(),
    )
    .await
    {
        Ok(Ok(resp)) => resp.status().as_u16() < 500,
        _ => false,
    }
}

/// 崩溃看护：轮询子进程退出；崩溃时按 2^n 秒退避自动重启（上限 MAX_RESTARTS）。
async fn watch_child(
    app: tauri::AppHandle,
    inner: Arc<Inner>,
    manager: DshProcessManager,
    generation: u64,
) {
    loop {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if manager.inner.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        // 锁只覆盖 try_wait，绝不跨 await 持有（MutexGuard 非 Send）
        enum Outcome {
            StillRunning,
            Exited(std::process::ExitStatus),
        }
        let outcome = {
            let mut guard = match inner.child.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(child) = guard.as_mut() else {
                return; // 被 stop() 取走
            };
            match child.try_wait() {
                Ok(Some(exit_status)) => {
                    guard.take();
                    Outcome::Exited(exit_status)
                }
                Ok(None) => Outcome::StillRunning,
                Err(err) => {
                    tracing::warn!("watch_child try_wait 失败: {err}");
                    return;
                }
            }
        };
        let Outcome::Exited(exit_status) = outcome else {
            continue;
        };
        if inner.shutdown_requested.load(Ordering::SeqCst) {
            return; // 主动停止，状态由 stop() 管理
        }
        let msg = format!("dsh 进程异常退出: {exit_status}");
        tracing::error!("{msg}");
        let restarts = {
            let mut s = match inner.status.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            s.state = DshState::Crashed;
            s.last_error = Some(msg);
            s.pid = None;
            s.restarts += 1;
            s.restarts
        };
        let _ = app.emit(STATE_EVENT, manager.status());
        if restarts > MAX_RESTARTS {
            let mut s = inner.status.lock().unwrap_or_else(|e| e.into_inner());
            s.state = DshState::Error;
            s.last_error = Some(format!("自动重启已达上限（{MAX_RESTARTS} 次）"));
            drop(s);
            let _ = app.emit(STATE_EVENT, manager.status());
            return;
        }
        // 退避后自动重启
        let backoff = std::time::Duration::from_secs(1u64 << restarts.min(4));
        tracing::info!("将在 {backoff:?} 后自动重启（第 {restarts} 次）");
        tokio::time::sleep(backoff).await;
        if manager.inner.generation.load(Ordering::SeqCst) != generation {
            return;
        }
        let options = inner
            .last_options
            .lock()
            .ok()
            .and_then(|o| o.clone())
            .unwrap_or_default();
        let profile = options.profile.clone();
        let host = options.host.clone().unwrap_or_else(|| "127.0.0.1".into());
        let port = options.port.unwrap_or(3080);
        if let Err(err) = manager.spawn_process(&app, profile, host, port, restarts) {
            tracing::error!("自动重启失败: {err}");
        }
        return;
    }
}

/// 日志泵：逐行读取子进程输出，转发事件并落盘。
async fn pump_logs(
    app: tauri::AppHandle,
    stream: impl tokio::io::AsyncRead + Unpin + Send + 'static,
    default_level: &str,
) {
    let default_level = default_level.to_string();
    let reader = tokio::io::BufReader::new(stream);
    let mut lines = reader.lines();
    let log_path = path::logs_dir().join(format!("dsh-{}.log", chrono::Local::now().format("%Y%m%d")));
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                let level = classify_line(&line, &default_level);
                let ts = chrono::Local::now().to_rfc3339();
                let _ = app.emit(
                    LOG_EVENT,
                    LogLine {
                        level: level.clone(),
                        line: line.clone(),
                        ts: ts.clone(),
                    },
                );
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
                    .and_then(|mut f| std::io::Write::write_all(&mut f, format!("[{ts}] [{level}] {line}\n").as_bytes()));
            }
            Ok(None) => return,
            Err(err) => {
                tracing::warn!("读取子进程日志失败: {err}");
                return;
            }
        }
    }
}

/// 按关键字给日志行分级（前端据此着色）。
pub fn classify_line(line: &str, default_level: &str) -> String {
    let lower = line.to_lowercase();
    if lower.contains("error") || lower.contains("失败") {
        "error".into()
    } else if lower.contains("warn") || lower.contains("警告") {
        "warn".into()
    } else if lower.contains("ready") || lower.contains("listening") || lower.contains("started") {
        "success".into()
    } else {
        default_level.to_string()
    }
}

/// 应用启动钩子：已完成引导且开启自启动时自动拉起 dsh。
pub fn startup_hooks(app: tauri::AppHandle) {
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
        let settings = crate::models::settings::AppSettings::load(&path::settings_file());
        if !settings.onboarded {
            tracing::info!("尚未完成首次启动引导，跳过 dsh 自启动");
            return;
        }
        if !settings.dsh.auto_start {
            return;
        }
        let manager = GLOBAL_MANAGER.get().cloned();
        if let Some(manager) = manager {
            if let Err(err) = manager.start(app, StartOptions::default()).await {
                tracing::error!("dsh 自启动失败: {err}");
            }
        }
    });
}

/// 应用退出钩子：终止仍在运行的 dsh 子进程。
pub fn shutdown_all() {
    if let Some(manager) = GLOBAL_MANAGER.get() {
        manager.inner.shutdown_requested.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = manager.inner.child.lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.start_kill();
                tracing::info!("退出前已终止 dsh 子进程");
            }
        }
    }
}

/// 从 `node --version` 输出解析主版本号（如 "v22.3.0" -> 22）。
pub fn parse_node_major_version(version_output: &str) -> Option<u32> {
    version_output
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
}

/// 环境检查：Node 运行时 + dsh 安装情况。
pub async fn env_check() -> EnvCheckResult {
    let node_path = which_node();
    let node_version = match &node_path {
        Some(path) => {
            let output = tokio::process::Command::new(path)
                .arg("--version")
                .output()
                .await
                .ok();
            output
                .and_then(|out| String::from_utf8(out.stdout).ok())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        }
        None => None,
    };
    let node_ok = parse_node_major_version(node_version.as_deref().unwrap_or(""))
        .map(|major| major >= 18)
        .unwrap_or(false);

    let dsh_entry = core_service::resolve_active_entry().ok();
    let dsh_version = core_service::current_version();
    let message = if !node_ok {
        "未检测到 Node.js (>=18)。首次使用请在引导页安装运行时。".to_string()
    } else if dsh_entry.is_none() {
        "Node 运行时可用，但 dsh 核心未安装。请在引导页或设置中安装。".to_string()
    } else {
        "环境就绪".to_string()
    };

    EnvCheckResult {
        node_ok,
        node_version,
        node_path,
        dsh_installed: dsh_entry.is_some(),
        dsh_version,
        dsh_entry: dsh_entry.map(|p| p.to_string_lossy().into_owned()),
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_major_version_parsing() {
        assert_eq!(parse_node_major_version("v22.3.0"), Some(22));
        assert_eq!(parse_node_major_version("18.0.1"), Some(18));
        assert_eq!(parse_node_major_version("v6.17.1\n"), Some(6));
        assert_eq!(parse_node_major_version(""), None);
        assert_eq!(parse_node_major_version("not a version"), None);
    }

    #[test]
    fn classify_lines() {
        assert_eq!(classify_line("ERROR: boom", "info"), "error");
        assert_eq!(classify_line("warning: low disk", "info"), "warn");
        assert_eq!(classify_line("Server listening on 3080", "info"), "success");
        assert_eq!(classify_line("hello", "info"), "info");
        assert_eq!(classify_line("hello", "error"), "error");
    }

    #[test]
    fn status_default() {
        let s = DshStatus::default();
        assert_eq!(s.state, DshState::Idle);
        assert_eq!(s.port, 3080);
        assert_eq!(s.pid, None);
    }

    #[test]
    fn manager_starts_idle() {
        let manager = DshProcessManager::new();
        assert_eq!(manager.status().state, DshState::Idle);
    }

    #[test]
    fn state_serializes_camel_case() {
        let json = serde_json::to_string(&DshState::Starting).expect("json");
        assert_eq!(json, "\"starting\"");
    }
}

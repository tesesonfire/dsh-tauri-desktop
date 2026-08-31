//! 插件受限 API 实现：fs / exec / storage / git / http / ui / 通知。
//!
//! 安全规则（与 docs/ARCHITECTURE.md §9 对应）：
//! - fs：路径必须在白名单目录内（默认 `~/.dsh/**` + 档案目录 + 设置的扩展目录）
//! - exec：命令必须在允许列表中，且拒绝任何包含危险模式（`rm -rf` /、`format`、
//!   `shutdown` 等）的参数
//! - http：一律由 Rust 端代理发出，插件 iframe 不直连外网
//! - git：仅允许封装的基本子命令

use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::models::plugin::{Manifest, Permission};
use crate::services::plugin_service;
use crate::utils::path;

/// 危险命令模式：出现即拒绝（不区分大小写）。
const DANGEROUS_PATTERNS: &[&str] = &[
    "rm -rf /",
    "rm -rf ~",
    "format ",
    "shutdown",
    "del /f /s /q c:",
    "mkfs",
    ":(){ :|:& };:",
    "> /dev/sda",
    "reg delete hk",
    "vssadmin delete",
];

/// Git 允许的子命令。
const GIT_ALLOWED_SUBCOMMANDS: &[&str] = &[
    "status", "diff", "log", "branch", "worktree", "clone", "checkout", "add",
    "commit", "fetch", "pull", "push",
];

/// shell 解释器：插件不得直接拉起（绕过按命令名的白名单模型）。
const SHELL_INTERPRETERS: &[&str] = &[
    "sh", "bash", "dash", "zsh", "fish", "powershell", "pwsh", "cmd", "cmd.exe",
];

/// 受保护文件名：插件 fs.write 绝对禁止写入（按文件名匹配，覆盖 ~/.dsh 下所有目录）。
///
/// - `manifest.json`：运行时每次桥接调用都会重读 manifest（`runtime::execute`），
///   插件覆写自身 manifest 即可在下一次调用时获得新权限 —— 直接的权限自提升。
/// - `settings.json`：含 exec/fs 白名单与代理，覆写即可放宽安全边界。
/// - `plugin-state.json`：含插件启用状态，覆写即可绕过「禁用」。
/// - `profiles.json`：档案列表，覆写可注入恶意档案指向任意目录。
const PROTECTED_FILENAMES: &[&str] = &[
    "manifest.json",
    "settings.json",
    "plugin-state.json",
    "profiles.json",
];

/// 判断目标路径是否指向受保护文件（仅按文件名匹配）。
fn is_protected_write_target(target: &std::path::Path) -> bool {
    target
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| PROTECTED_FILENAMES.contains(&name))
        .unwrap_or(false)
}

/// fs 白名单：默认 `~/.dsh` + 用户扩展。
pub fn effective_fs_allowlist() -> Vec<String> {
    let settings = crate::models::settings::AppSettings::load(&path::settings_file());
    let mut list = settings.advanced.fs_allowlist.clone();
    list.push(path::dsh_home().to_string_lossy().into_owned());
    list
}

/// exec 允许列表：设置 > 默认。
pub fn effective_exec_allowlist() -> Vec<String> {
    crate::models::settings::AppSettings::load(&path::settings_file())
        .advanced
        .exec_allowlist
}

fn require_permission(manifest: &Manifest, permission: Permission) -> AppResult<()> {
    if manifest.permissions.contains(&permission) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "插件 {} 缺少权限: {}",
            manifest.id, permission
        )))
    }
}

fn dangerous_argument(args: &[String]) -> bool {
    // 折叠连续空白（含 tab/多空格）后再匹配，对抗 `rm  -rf  /` 类绕过；
    // 跨参数拼接场景（如 ["rm -rf", "/"]）也由 join + 折叠统一覆盖。
    let normalized = args
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    DANGEROUS_PATTERNS
        .iter()
        .any(|pattern| normalized.contains(pattern))
}

// ---------- fs ----------

pub fn fs_read(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Fs)?;
    let file = params
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("fs.read 需要 path 参数".into()))?;
    let target = std::path::Path::new(file);
    if !super::loader::path_in_allowlist(target, &effective_fs_allowlist()) {
        return Err(AppError::InvalidInput(format!("路径不在白名单内: {file}")));
    }
    let content = std::fs::read_to_string(target)?;
    Ok(json!({ "content": content }))
}

pub fn fs_write(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Fs)?;
    let file = params
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("fs.write 需要 path 参数".into()))?;
    let content = params
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let target = std::path::Path::new(file);
    // 受保护文件绝对禁止写入：manifest/settings/插件状态/档案列表。
    // 即使路径落在 fs 白名单内（默认 ~/.dsh/**）也拒绝 —— 防止插件通过覆写
    // manifest 自提升权限，或篡改 settings 放宽 exec/fs 白名单。
    if is_protected_write_target(target) {
        return Err(AppError::InvalidInput(format!(
            "禁止写入受保护文件: {file}（manifest/settings/插件状态/档案列表不可由插件覆写）"
        )));
    }
    if !super::loader::path_in_allowlist(target, &effective_fs_allowlist()) {
        return Err(AppError::InvalidInput(format!("路径不在白名单内: {file}")));
    }
    if let Some(parent) = target.parent() {
        path::ensure_dir(parent)?;
    }
    std::fs::write(target, content)?;
    Ok(json!({ "ok": true }))
}

// ---------- exec ----------

pub fn exec_run(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Exec)?;
    let command = params
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("exec.run 需要 command 参数".into()))?
        .to_string();
    let args: Vec<String> = params
        .get("args")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let allowlist = effective_exec_allowlist();
    if !allowlist.iter().any(|allowed| allowed == &command) {
        return Err(AppError::InvalidInput(format!(
            "命令 {command} 不在允许列表中"
        )));
    }
    // 硬拒绝 shell 解释器：允许插件拉起 shell 等价于放开任意命令执行，
    // 与「按命令名白名单」的权限模型冲突（即使用户显式加入白名单也拒绝）。
    let command_exe = std::path::Path::new(&command)
        .file_stem()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if SHELL_INTERPRETERS.contains(&command_exe.as_str()) {
        return Err(AppError::InvalidInput(
            "不允许通过插件执行 shell 解释器（避免绕过命令白名单）".into(),
        ));
    }
    if dangerous_argument(&args) {
        return Err(AppError::InvalidInput("检测到危险命令参数，已拒绝执行".into()));
    }
    let output = std::process::Command::new(&command)
        .args(&args)
        .output()
        .map_err(|err| AppError::Message(format!("命令执行失败: {err}")))?;
    Ok(json!({
        "code": output.status.code(),
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
    }))
}

// ---------- git ----------

pub fn git_run(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Git)?;
    let args: Vec<String> = params
        .get("args")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .ok_or_else(|| AppError::InvalidInput("git.run 需要 args 参数".into()))?;
    let Some(sub) = args.first().map(|s| s.as_str()) else {
        return Err(AppError::InvalidInput("git.run 缺少子命令".into()));
    };
    if !GIT_ALLOWED_SUBCOMMANDS.contains(&sub) {
        return Err(AppError::InvalidInput(format!(
            "git 子命令 {sub} 不在允许列表中"
        )));
    }
    if dangerous_argument(&args) {
        return Err(AppError::InvalidInput("检测到危险命令参数，已拒绝执行".into()));
    }
    let cwd = params
        .get("cwd")
        .and_then(Value::as_str)
        .map(std::path::PathBuf::from);
    let mut cmd = std::process::Command::new("git");
    cmd.args(&args);
    if let Some(dir) = cwd {
        if !super::loader::path_in_allowlist(&dir, &effective_fs_allowlist()) {
            return Err(AppError::InvalidInput("cwd 不在白名单内".into()));
        }
        cmd.current_dir(&dir);
    }
    let output = cmd
        .output()
        .map_err(|err| AppError::Message(format!("git 执行失败: {err}")))?;
    Ok(json!({
        "code": output.status.code(),
        "stdout": String::from_utf8_lossy(&output.stdout),
        "stderr": String::from_utf8_lossy(&output.stderr),
    }))
}

// ---------- storage ----------

pub fn storage_get(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Storage)?;
    let key = params
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("storage.get 需要 key 参数".into()))?;
    let value = plugin_service::storage_get(&manifest.id, key)?;
    Ok(json!({ "value": value }))
}

pub fn storage_set(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Storage)?;
    let key = params
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("storage.set 需要 key 参数".into()))?;
    let value = params
        .get("value")
        .map(|v| match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        })
        .ok_or_else(|| AppError::InvalidInput("storage.set 需要 value 参数".into()))?;
    plugin_service::storage_set(&manifest.id, key, &value)?;
    Ok(json!({ "ok": true }))
}

pub fn storage_delete(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Storage)?;
    let key = params
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("storage.delete 需要 key 参数".into()))?;
    let removed = plugin_service::storage_delete(&manifest.id, key)?;
    Ok(json!({ "removed": removed }))
}

// ---------- http ----------

pub async fn http_request(manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Network)?;
    let method = params
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("GET")
        .to_uppercase();
    let url = params
        .get("url")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("http.request 需要 url 参数".into()))?;
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err(AppError::InvalidInput("仅支持 http/https 请求".into()));
    }
    let client = crate::services::workflow_service::http_client();
    let mut request = match method.as_str() {
        "GET" => client.get(url),
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        "PATCH" => client.patch(url),
        other => return Err(AppError::InvalidInput(format!("不支持的方法: {other}"))),
    };
    if let Some(headers) = params.get("headers").and_then(Value::as_object) {
        for (k, v) in headers {
            if let Some(vs) = v.as_str() {
                request = request.header(k, vs);
            }
        }
    }
    if let Some(body) = params.get("body") {
        request = request.body(body.to_string());
    }
    let response = request.send().await?;
    let status = response.status().as_u16();
    let text = response.text().await?;
    Ok(json!({ "status": status, "body": text }))
}

// ---------- ui / notification ----------

pub fn ui_show_notification(app: &tauri::AppHandle, manifest: &Manifest, params: &Value) -> AppResult<Value> {
    require_permission(manifest, Permission::Notification)?;
    let title = params
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&manifest.name)
        .to_string();
    let body = params
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    crate::services::notification_service::send(app, &title, &body)?;
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_with(perms: &[Permission]) -> Manifest {
        Manifest {
            id: "test.plugin".into(),
            name: "Test".into(),
            version: "0.1.0".into(),
            description: String::new(),
            author: String::new(),
            entry: "index.html".into(),
            permissions: perms.to_vec(),
            contributes: Default::default(),
        }
    }

    #[test]
    fn permission_gate_blocks() {
        let m = manifest_with(&[]);
        let err = storage_get(&m, &json!({ "key": "k" })).expect_err("denied");
        assert!(err.to_string().contains("缺少权限"));
    }

    #[test]
    fn permission_gate_allows() {
        let m = manifest_with(&[Permission::Storage]);
        // 键不存在 -> value null，不报权限错误
        let value = storage_get(&m, &json!({ "key": "nope" })).expect("allowed");
        assert_eq!(value["value"], Value::Null);
    }

    #[test]
    fn dangerous_args_rejected() {
        assert!(!dangerous_argument(&["-rf".into(), "/".into()]));
        assert!(dangerous_argument(&["rm".into(), "-rf".into(), "/".into()]));
        assert!(dangerous_argument(&["shutdown".into(), "/s".into()]));
        assert!(!dangerous_argument(&["status".into()]));
        // 空白绕过：单参数内多空格 / tab 分隔仍应命中
        assert!(dangerous_argument(&["rm  -rf  /".into()]));
        assert!(dangerous_argument(&["rm\t-rf\t/".into()]));
        assert!(dangerous_argument(&["rm".into(), "-rf".into(), "  /  ".into()]));
    }

    #[test]
    fn protected_files_detected() {
        assert!(is_protected_write_target(std::path::Path::new(
            "~/.dsh/plugins/x/manifest.json"
        )));
        assert!(is_protected_write_target(std::path::Path::new(
            "C:/Users/u/.dsh/settings.json"
        )));
        assert!(is_protected_write_target(std::path::Path::new(
            "plugin-state.json"
        )));
        assert!(is_protected_write_target(std::path::Path::new(
            "profiles.json"
        )));
        // 普通数据文件不受保护
        assert!(!is_protected_write_target(std::path::Path::new(
            "~/.dsh/storage/x.json"
        )));
        assert!(!is_protected_write_target(std::path::Path::new("notes.txt")));
    }

    #[test]
    fn fs_write_rejects_protected_files() {
        let m = manifest_with(&[Permission::Fs]);
        // manifest.json：即便有 fs 权限也禁止覆写（防止权限自提升）
        let err = fs_write(&m, &json!({ "path": "manifest.json", "content": "x" }))
            .expect_err("manifest protected");
        assert!(err.to_string().contains("受保护文件"));
        let err = fs_write(&m, &json!({ "path": "settings.json", "content": "x" }))
            .expect_err("settings protected");
        assert!(err.to_string().contains("受保护文件"));
    }

    #[test]
    fn exec_blocklist_enforced() {
        let m = manifest_with(&[Permission::Exec]);
        // 不在允许列表的命令
        let err = exec_run(&m, &json!({ "command": "curl", "args": [] })).expect_err("denied");
        assert!(err.to_string().contains("不在允许列表"));
    }

    #[test]
    fn git_subcommand_allowlist() {
        let m = manifest_with(&[Permission::Git]);
        let err = git_run(&m, &json!({ "args": ["clean", "-fd"] })).expect_err("denied");
        assert!(err.to_string().contains("不在允许列表"));
    }

    #[test]
    fn http_rejects_non_http_url() {
        // 非异步路径校验：仅检查 URL scheme 拒绝逻辑（借助 tokio 当前线程运行时）
        let rt = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("rt");
        let m = manifest_with(&[Permission::Network]);
        let err = rt
            .block_on(http_request(&m, &json!({ "url": "file:///etc/passwd" })))
            .expect_err("denied");
        assert!(err.to_string().contains("仅支持"));
    }
}

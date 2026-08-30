//! 插件桥接运行时：把 postMessage 桥接的方法调用路由到受限 API 实现。
//!
//! 每次调用都会：
//! 1. 重新读取 manifest（保证卸载/禁用立即生效）；
//! 2. 检查插件是否启用；
//! 3. 按方法名分发到 `api` 模块并做权限校验。

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::plugins::api;
use crate::services::plugin_service;

/// 执行一次插件桥接调用。
pub async fn execute(
    app: &AppHandle,
    plugin_id: &str,
    method: &str,
    params: &Value,
) -> AppResult<Value> {
    let manifest = plugin_service::manifest_raw(app, plugin_id)?;
    if !plugin_service::is_enabled(&manifest.id) {
        return Err(AppError::InvalidInput(format!(
            "插件 {} 已被禁用",
            manifest.id
        )));
    }

    let result = match method {
        "ping" => Ok(json!({ "ok": true, "version": env!("CARGO_PKG_VERSION") })),
        "fs.read" => api::fs_read(&manifest, params),
        "fs.write" => api::fs_write(&manifest, params),
        "exec.run" => api::exec_run(&manifest, params),
        "storage.get" => api::storage_get(&manifest, params),
        "storage.set" => api::storage_set(&manifest, params),
        "storage.delete" => api::storage_delete(&manifest, params),
        "git.run" => api::git_run(&manifest, params),
        "http.request" => api::http_request(&manifest, params).await,
        "ui.showNotification" => api::ui_show_notification(app, &manifest, params),
        // UI 注册类方法由前端 PluginBridge 消费（侧边栏/面板/菜单在 WebView 内渲染）
        "ui.registerSidebar" | "ui.registerPanel" | "ui.registerContextMenu" => {
            Ok(json!({ "ok": true, "delegated": "frontend" }))
        }
        // Tauri 命令透传走严格白名单，防止插件越权
        "tauri.invoke" => tauri_invoke_allowlist(&manifest, params),
        other => Err(AppError::InvalidInput(format!(
            "未知桥接方法: {other}"
        ))),
    }?;

    tracing::debug!("插件 {} 调用 {method} 成功", manifest.id);
    Ok(result)
}

/// tauri.invoke 白名单：插件只能调用极少数无副作用/信息类命令。
fn tauri_invoke_allowlist(
    manifest: &crate::models::plugin::Manifest,
    params: &Value,
) -> AppResult<Value> {
    const ALLOWED: &[&str] = &["app_version", "dsh_status", "profile_list"];
    let command = params
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| AppError::InvalidInput("tauri.invoke 需要 command 参数".into()))?;
    if !ALLOWED.contains(&command) {
        let manifest_id = manifest.id.clone();
        return Err(AppError::InvalidInput(format!(
            "插件 {manifest_id} 不允许调用命令 {command}"
        )));
    }
    Ok(json!({ "ok": true, "delegated": "frontend" }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::plugin::Manifest;

    fn test_manifest() -> Manifest {
        Manifest {
            id: "com.test.plugin".into(),
            name: "Test".into(),
            version: "0.1.0".into(),
            description: String::new(),
            author: String::new(),
            entry: "index.html".into(),
            permissions: vec![],
            contributes: Default::default(),
        }
    }

    #[test]
    fn tauri_invoke_requires_command_param() {
        let err = tauri_invoke_allowlist(&test_manifest(), &Value::Null).expect_err("denied");
        assert!(err.to_string().contains("需要 command 参数"));
    }

    #[test]
    fn tauri_invoke_blocks_unknown_command() {
        let err = tauri_invoke_allowlist(&test_manifest(), &json!({ "command": "fs_read" }))
            .expect_err("denied");
        assert!(err.to_string().contains("不允许调用命令 fs_read"));
    }

    #[test]
    fn tauri_invoke_accepts_whitelisted() {
        let result =
            tauri_invoke_allowlist(&test_manifest(), &json!({ "command": "dsh_status" }))
                .expect("allowed");
        assert_eq!(result["delegated"], "frontend");
        assert_eq!(result["ok"], true);
    }
}

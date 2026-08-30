//! 插件管理命令 + postMessage 桥接的后端入口。

use serde_json::Value;
use tauri::AppHandle;

use crate::error::AppResult;
use crate::models::plugin::{Manifest, PluginInfo};
use crate::plugins::runtime;
use crate::services::plugin_service;

/// 列出全部插件（内置 + 用户）。
#[tauri::command]
pub fn plugin_list(app: AppHandle) -> AppResult<Vec<PluginInfo>> {
    plugin_service::list(&app)
}

/// 从本地路径安装插件。
#[tauri::command]
pub fn plugin_install(path: String) -> AppResult<PluginInfo> {
    plugin_service::install_from_path(std::path::Path::new(&path))
}

/// 卸载插件。
#[tauri::command]
pub fn plugin_uninstall(app: AppHandle, id: String) -> AppResult<()> {
    plugin_service::uninstall(&app, &id)
}

/// 启用/禁用插件。
#[tauri::command]
pub fn plugin_set_enabled(id: String, enabled: bool) -> AppResult<()> {
    plugin_service::set_enabled(&id, enabled)
}

/// 写入插件用户配置。
#[tauri::command]
pub fn plugin_set_config(id: String, config: Value) -> AppResult<()> {
    plugin_service::set_config(&id, config)
}

/// 读取插件用户配置。
#[tauri::command]
pub fn plugin_get_config(id: String) -> Value {
    plugin_service::get_config(&id)
}

/// 读取插件 README（Markdown 原文）。
#[tauri::command]
pub fn plugin_readme(app: AppHandle, id: String) -> AppResult<String> {
    plugin_service::readme(&app, &id)
}

/// 读取插件 manifest（结构化）。
#[tauri::command]
pub fn plugin_manifest(app: AppHandle, id: String) -> AppResult<Manifest> {
    plugin_service::manifest_raw(&app, &id)
}

/// 插件 KV 存储读取。
#[tauri::command]
pub fn plugin_storage_get(plugin_id: String, key: String) -> AppResult<Option<String>> {
    plugin_service::storage_get(&plugin_id, &key)
}

/// 插件 KV 存储写入。
#[tauri::command]
pub fn plugin_storage_set(plugin_id: String, key: String, value: String) -> AppResult<()> {
    plugin_service::storage_set(&plugin_id, &key, &value)
}

/// 插件 KV 存储删除。
#[tauri::command]
pub fn plugin_storage_delete(plugin_id: String, key: String) -> AppResult<bool> {
    plugin_service::storage_delete(&plugin_id, &key)
}

/// postMessage 桥接的后端执行入口（权限校验在此完成）。
#[tauri::command]
pub async fn plugin_bridge_call(
    app: AppHandle,
    plugin_id: String,
    method: String,
    params: Option<Value>,
) -> AppResult<Value> {
    runtime::execute(&app, &plugin_id, &method, &params.unwrap_or(Value::Null)).await
}

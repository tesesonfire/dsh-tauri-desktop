//! 插件服务：发现（扫描目录）、安装、卸载、启用/禁用、按插件隔离的 KV 存储。
//!
//! 目录布局：
//! - 内置插件：随应用资源分发（dev 模式下为仓库 `plugins/` 目录）
//! - 用户插件：`~/.dsh/plugins/<id>/`
//! - 启用状态与配置：`~/.dsh/plugin-state.json`
//! - KV 存储：`~/.dsh/storage/<id>.json`

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::models::plugin::{Manifest, PluginInfo};
use crate::utils::path;

static STORE_LOCK: Mutex<()> = Mutex::new(());

/// 插件启用状态与用户配置。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PluginState {
    /// id -> enabled（缺省视为 true）。
    pub enabled: BTreeMap<String, bool>,
    /// id -> 用户配置（设置页动态表单写入）。
    pub config: BTreeMap<String, serde_json::Value>,
}

impl PluginState {
    fn load() -> Self {
        let file = path::plugin_state_file();
        std::fs::read_to_string(&file)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    fn save(&self) -> AppResult<()> {
        let file = path::plugin_state_file();
        if let Some(parent) = file.parent() {
            path::ensure_dir(parent)?;
        }
        std::fs::write(&file, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    fn is_enabled(&self, id: &str) -> bool {
        self.enabled.get(id).copied().unwrap_or(true)
    }
}

/// 内置插件目录解析顺序：环境变量 -> 应用资源目录 -> 仓库源码目录（dev）。
pub fn builtin_plugins_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(from_env) = std::env::var("DSH_BUILTIN_PLUGINS_DIR") {
        let dir = PathBuf::from(from_env);
        if dir.is_dir() {
            return Some(dir);
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        let dir = resource_dir.join("plugins");
        if dir.is_dir() {
            return Some(dir);
        }
    }
    // dev 模式回退：cargo 工作目录是 src-tauri，仓库 plugins/ 在其上一级
    if let Ok(cwd) = std::env::current_dir() {
        let candidate = cwd.join("plugins");
        if candidate.is_dir() {
            return Some(candidate);
        }
        if let Some(parent) = cwd.parent() {
            let candidate = parent.join("plugins");
            if candidate.is_dir() {
                return Some(candidate);
            }
        }
    }
    None
}

/// 扫描一个插件目录集合，解析出全部合法插件。
fn scan_dirs(dirs: Vec<(PathBuf, bool)>) -> Vec<PluginInfo> {
    let state = PluginState::load();
    let mut infos = Vec::new();
    for (dir, builtin) in dirs {
        let entries = match std::fs::read_dir(&dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let plugin_dir = entry.path();
            if !plugin_dir.is_dir() {
                continue;
            }
            let manifest_path = plugin_dir.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            let error = std::fs::read_to_string(&manifest_path)
                .map_err(|err| err.to_string())
                .and_then(|raw| {
                    serde_json::from_str::<Manifest>(&raw)
                        .map_err(|err| format!("manifest 解析失败: {err}"))
                })
                .and_then(|manifest| manifest.validate().map_err(|err| err.to_string()))
                .err();
            let parsed = std::fs::read_to_string(&manifest_path)
                .ok()
                .and_then(|raw| serde_json::from_str::<Manifest>(&raw).ok());
            let Some(manifest) = parsed else {
                infos.push(PluginInfo {
                    manifest: fallback_manifest(&plugin_dir),
                    dir: plugin_dir.to_string_lossy().into_owned(),
                    enabled: false,
                    builtin,
                    error: error.or_else(|| Some("manifest 无法解析".into())),
                });
                continue;
            };
            infos.push(PluginInfo {
                manifest,
                dir: plugin_dir.to_string_lossy().into_owned(),
                enabled: state.is_enabled(
                    &plugin_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                ),
                builtin,
                error,
            });
        }
    }
    infos
}

/// manifest 损坏时的占位信息（保证前端能展示错误详情）。
fn fallback_manifest(dir: &Path) -> Manifest {
    Manifest {
        id: dir
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".into()),
        name: "（损坏的插件）".into(),
        version: "0.0.0".into(),
        description: String::new(),
        author: String::new(),
        entry: String::new(),
        permissions: Vec::new(),
        contributes: Default::default(),
    }
}

/// 列出全部插件（内置 + 用户）。
pub fn list(app: &tauri::AppHandle) -> AppResult<Vec<PluginInfo>> {
    let mut dirs = Vec::new();
    if let Some(builtin_dir) = builtin_plugins_dir(app) {
        dirs.push((builtin_dir, true));
    }
    let user_dir = path::plugins_dir();
    path::ensure_dir(&user_dir)?;
    dirs.push((user_dir, false));
    Ok(scan_dirs(dirs))
}

/// 从磁盘路径安装插件（复制到用户插件目录）。
pub fn install_from_path(src: &Path) -> AppResult<PluginInfo> {
    let manifest_path = src.join("manifest.json");
    if !manifest_path.exists() {
        return Err(AppError::NotFound(format!(
            "目录中缺少 manifest.json: {}",
            src.display()
        )));
    }
    let manifest: Manifest =
        serde_json::from_str(&std::fs::read_to_string(&manifest_path)?)?;
    manifest.validate()?;
    let dest = path::plugins_dir().join(&manifest.id);
    if dest.exists() {
        std::fs::remove_dir_all(&dest)?;
    }
    crate::services::core_service::copy_dir_recursive(src, &dest)?;
    tracing::info!("插件已安装: {} v{}", manifest.id, manifest.version);
    Ok(PluginInfo {
        manifest,
        dir: dest.to_string_lossy().into_owned(),
        enabled: true,
        builtin: false,
        error: None,
    })
}

/// 卸载用户插件（内置插件禁止卸载）。
pub fn uninstall(app: &tauri::AppHandle, id: &str) -> AppResult<()> {
    let dir = path::plugins_dir().join(id);
    if !dir.is_dir() {
        // 可能是内置插件
        if let Some(builtin_dir) = builtin_plugins_dir(app) {
            if builtin_dir.join(id).is_dir() {
                return Err(AppError::InvalidInput("内置插件不能卸载，只能禁用".into()));
            }
        }
        return Err(AppError::NotFound(format!("插件 {id} 未安装")));
    }
    std::fs::remove_dir_all(&dir)?;
    let mut state = PluginState::load();
    state.enabled.remove(id);
    state.config.remove(id);
    state.save()?;
    tracing::info!("插件已卸载: {id}");
    Ok(())
}

/// 启用/禁用插件。
pub fn set_enabled(id: &str, enabled: bool) -> AppResult<()> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("插件状态锁中毒".into()))?;
    let mut state = PluginState::load();
    state.enabled.insert(id.to_string(), enabled);
    state.save()?;
    tracing::info!("插件 {id} 已{}", if enabled { "启用" } else { "禁用" });
    Ok(())
}

/// 写入插件用户配置。
pub fn set_config(id: &str, config: serde_json::Value) -> AppResult<()> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("插件状态锁中毒".into()))?;
    let mut state = PluginState::load();
    state.config.insert(id.to_string(), config);
    state.save()?;
    Ok(())
}

/// 读取插件用户配置。
pub fn get_config(id: &str) -> serde_json::Value {
    PluginState::load()
        .config
        .get(id)
        .cloned()
        .unwrap_or(serde_json::Value::Null)
}

/// 读取插件 README（Markdown 文本）。
pub fn readme(app: &tauri::AppHandle, id: &str) -> AppResult<String> {
    for dir in plugin_roots(app) {
        let candidate = dir.join(id).join("README.md");
        if candidate.exists() {
            return Ok(std::fs::read_to_string(&candidate)?);
        }
    }
    Err(AppError::NotFound(format!("插件 {id} 无 README")))
}

/// 读取插件 manifest 原文。
pub fn manifest_raw(app: &tauri::AppHandle, id: &str) -> AppResult<Manifest> {
    for dir in plugin_roots(app) {
        let candidate = dir.join(id).join("manifest.json");
        if candidate.exists() {
            let manifest: Manifest =
                serde_json::from_str(&std::fs::read_to_string(&candidate)?)?;
            return Ok(manifest);
        }
    }
    Err(AppError::NotFound(format!("插件 {id} 不存在")))
}

/// 全部插件根目录（内置 + 用户）。
pub fn plugin_roots(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(builtin) = builtin_plugins_dir(app) {
        roots.push(builtin);
    }
    roots.push(path::plugins_dir());
    roots
}

/// 按 id 解析插件根目录。
pub fn plugin_dir(app: &tauri::AppHandle, id: &str) -> Option<PathBuf> {
    id.rsplit(['/', '\\'])
        .next()
        .and_then(|safe_id| {
            // 防穿越：只取最后一段
            if safe_id.contains("..") {
                return None;
            }
            plugin_roots(app)
                .into_iter()
                .map(|root| root.join(safe_id))
                .find(|dir| dir.is_dir())
        })
}

/// 查询插件是否启用（未注册过视为启用）。
pub fn is_enabled(id: &str) -> bool {
    PluginState::load().is_enabled(id)
}

// ---------- 按插件隔离的 KV 存储 ----------

fn storage_file(plugin_id: &str) -> AppResult<PathBuf> {
    let safe_id = path::sanitize_name(&plugin_id.replace('.', "-"))?;
    Ok(path::storage_dir().join(format!("{safe_id}.json")))
}

/// 读插件存储。
pub fn storage_get(plugin_id: &str, key: &str) -> AppResult<Option<String>> {
    let file = storage_file(plugin_id)?;
    if !file.exists() {
        return Ok(None);
    }
    let map: BTreeMap<String, String> =
        serde_json::from_str(&std::fs::read_to_string(&file)?)?;
    Ok(map.get(key).cloned())
}

/// 写插件存储。
pub fn storage_set(plugin_id: &str, key: &str, value: &str) -> AppResult<()> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("存储锁中毒".into()))?;
    let file = storage_file(plugin_id)?;
    path::ensure_dir(path::storage_dir().as_path())?;
    let mut map: BTreeMap<String, String> = if file.exists() {
        serde_json::from_str(&std::fs::read_to_string(&file)?)?
    } else {
        BTreeMap::new()
    };
    map.insert(key.to_string(), value.to_string());
    std::fs::write(&file, serde_json::to_string_pretty(&map)?)?;
    Ok(())
}

/// 删除插件存储键。
pub fn storage_delete(plugin_id: &str, key: &str) -> AppResult<bool> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("存储锁中毒".into()))?;
    let file = storage_file(plugin_id)?;
    if !file.exists() {
        return Ok(false);
    }
    let mut map: BTreeMap<String, String> =
        serde_json::from_str(&std::fs::read_to_string(&file)?)?;
    let removed = map.remove(key).is_some();
    std::fs::write(&file, serde_json::to_string_pretty(&map)?)?;
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn storage_roundtrip_in_tmp_home() {
        // 在进程内直接测试：storage 目录受 DSH_HOME 影响，
        // 测试依赖顺序不保证，这里只验证 sanitize 逻辑与文件名生成
        let name = storage_file("com.example.demo").expect("safe");
        assert!(name.to_string_lossy().contains("com-example-demo.json"));
    }

    #[test]
    fn plugin_state_defaults() {
        let mut state = PluginState::default();
        assert!(state.is_enabled("anything"));
        state.enabled.insert("x".into(), false);
        assert!(!state.is_enabled("x"));
    }
}

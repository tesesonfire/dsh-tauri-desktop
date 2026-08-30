//! 插件市场服务：官方插件注册表、GitHub 社区搜索、从仓库一键安装/升级。
//!
//! 数据源与流程对齐官方生态（dsh-tauri-desk/dsh-tauri-plugins）：
//! - 官方注册表：内置 `marketplace.json`（可经远程 URL 替换更新），失败时回退内置
//! - 社区搜索：GitHub Search API（按 star 排序）
//! - 安装：下载仓库 zipball → 解压 → 定位 manifest.json → 校验 → 复制到用户插件目录
//! - 升级：同安装流程覆盖旧目录（保留插件 storage）

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::plugin::PluginInfo;
use crate::services::plugin_service;
use crate::utils::path;

const GITHUB_SEARCH_URL: &str = "https://api.github.com/search/repositories";
const DEFAULT_REGISTRY_URL: &str = "https://raw.githubusercontent.com/dsh-tauri-desk/dsh-tauri-plugins/main/marketplace.json";

/// 市场中的一个插件条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPlugin {
    /// 插件包名（如 dsh-tauri-worktree），对应仓库内 packages/<name>。
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    /// 源仓库（owner/repo）。
    pub repo: String,
    /// 仓库内插件目录（含 manifest.json），根目录时为空串。
    #[serde(default)]
    pub path: String,
    /// 官方 / 社区。
    #[serde(default)]
    pub official: bool,
    #[serde(default)]
    pub tags: Vec<String>,
}

/// 市场注册表文件（远程可替换，字段向后兼容）。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MarketRegistry {
    pub updated_at: String,
    pub plugins: Vec<MarketPlugin>,
}

/// GitHub 仓库搜索结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketRepo {
    pub full_name: String,
    pub description: Option<String>,
    pub stars: u64,
    pub url: String,
}

/// 编译期内置的官方注册表（远程不可达时的回退数据源）。
fn builtin_registry() -> MarketRegistry {
    let raw = include_str!("../../resources/marketplace.json");
    serde_json::from_str(raw).unwrap_or_default()
}

/// 拉取官方市场注册表：远程 URL（env `DSH_MARKET_REGISTRY_URL` > 默认）优先，
/// 失败时回退到编译期内置版本（与核心更新检查的降级策略一致）。
pub async fn official_registry() -> MarketRegistry {
    let url = std::env::var("DSH_MARKET_REGISTRY_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_REGISTRY_URL.to_string());
    match crate::services::workflow_service::http_client().get(&url).send().await {
        Ok(response) if response.status().is_success() => match response.text().await {
            Ok(raw) => match serde_json::from_str::<MarketRegistry>(&raw) {
                Ok(registry) => {
                    tracing::info!("市场注册表已从远程更新: {} 个插件", registry.plugins.len());
                    return registry;
                }
                Err(err) => tracing::warn!("远程注册表解析失败，回退内置: {err}"),
            },
            Err(err) => tracing::warn!("远程注册表下载失败，回退内置: {err}"),
        },
        Ok(response) => tracing::warn!("远程注册表 HTTP {}，回退内置", response.status()),
        Err(err) => tracing::warn!("远程注册表不可达，回退内置: {err}"),
    }
    builtin_registry()
}

/// GitHub 仓库搜索（默认按 star 排序，取前 10）。
pub async fn search_github(query: &str) -> AppResult<Vec<MarketRepo>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("搜索词不能为空".into()));
    }
    let response = crate::services::workflow_service::http_client()
        .get(GITHUB_SEARCH_URL)
        .query(&[
            ("q", format!("{trimmed} dsh").as_str()),
            ("sort", "stars"),
            ("per_page", "10"),
        ])
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "GitHub 搜索失败: HTTP {}",
            response.status()
        )));
    }
    let body: serde_json::Value = response.json().await?;
    let mut repos = Vec::new();
    if let Some(items) = body.get("items").and_then(serde_json::Value::as_array) {
        for item in items {
            let full_name = item
                .get("full_name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();
            if full_name.is_empty() {
                continue;
            }
            repos.push(MarketRepo {
                stars: item.get("stargazers_count").and_then(serde_json::Value::as_u64).unwrap_or(0),
                full_name,
                description: item.get("description").and_then(serde_json::Value::as_str).map(str::to_string),
                url: item.get("html_url").and_then(serde_json::Value::as_str).unwrap_or_default().to_string(),
            });
        }
    }
    Ok(repos)
}

/// 在解压后的仓库树中定位包含 manifest.json 的插件目录。
///
/// 顺序：显式 subpath → 浅层扫描（深度 ≤ 3，取最浅唯一命中）。
pub fn locate_manifest_dir(extract_root: &Path, preferred_subpath: &str) -> AppResult<PathBuf> {
    if !preferred_subpath.trim().is_empty() {
        let candidate = extract_root.join(preferred_subpath);
        if candidate.join("manifest.json").is_file() {
            return Ok(candidate);
        }
    }
    if extract_root.join("manifest.json").is_file() {
        return Ok(extract_root.to_path_buf());
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    collect_manifest_dirs(extract_root, 0, &mut candidates);
    match candidates.len() {
        1 => Ok(candidates.remove(0)),
        0 => Err(AppError::NotFound(
            "仓库中未找到 manifest.json（插件根目录需包含 manifest.json）".into(),
        )),
        // 多个命中时取最浅的一个（官方 monorepo 布局 packages/<name> 由深度优先保证）
        _ => {
            candidates.sort_by_key(|p| p.components().count());
            Ok(candidates.remove(0))
        }
    }
}

fn collect_manifest_dirs(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        // 跳过版本控制与构建产物目录
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if matches!(name.as_str(), ".git" | "node_modules" | "dist" | "target") {
            continue;
        }
        if p.join("manifest.json").is_file() {
            out.push(p.clone());
        }
        collect_manifest_dirs(&p, depth + 1, out);
    }
}

/// 校验并归一化仓库标识（`owner/repo`）：去首尾斜杠与 `.git` 后缀，
/// 拒绝路径穿越、多级路径、空白与空串。
pub fn normalize_repo(repo: &str) -> AppResult<String> {
    let cleaned = repo
        .trim()
        .trim_start_matches('/')
        .trim_end_matches('/')
        .trim_end_matches(".git");
    if cleaned.is_empty() {
        return Err(AppError::InvalidInput("仓库标识不能为空".into()));
    }
    if cleaned.matches('/').count() != 1 {
        return Err(AppError::InvalidInput(format!(
            "仓库标识须为 owner/repo 形式: {cleaned}"
        )));
    }
    if cleaned.contains("..") || cleaned.contains(char::is_whitespace) {
        return Err(AppError::InvalidInput(format!("仓库标识非法: {cleaned}")));
    }
    Ok(cleaned.to_string())
}

/// 从 GitHub 仓库安装（或升级）插件：
/// 下载默认分支 zipball → 解压 → 定位插件目录 → 校验 → 复制到 `~/.dsh/plugins/<id>`。
pub async fn install_from_github(
    app: tauri::AppHandle,
    repo: &str,
    subpath: &str,
) -> AppResult<PluginInfo> {
    let repo = normalize_repo(repo)?;
    // api zipball 自动跟随默认分支（main/master 均可）
    let zip_url = format!("https://api.github.com/repos/{repo}/zipball");
    let tmp_dir = std::env::temp_dir().join(format!(
        "dsh-market-{}-{ts}",
        repo.replace('/', "-"),
        ts = chrono::Utc::now().timestamp_millis()
    ));
    path::ensure_dir(&tmp_dir)?;
    let zip_path = tmp_dir.join("plugin.zip");

    let download = crate::services::download_service::download_file_direct(
        &app,
        zip_url,
        zip_path.clone(),
    )
    .await;
    if let Err(err) = download {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(err);
    }

    let extract_dir = tmp_dir.join("extracted");
    path::ensure_dir(&extract_dir)?;
    if let Err(err) = crate::utils::archive::extract_zip(&zip_path, &extract_dir) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(err);
    }

    // zipball 会包一层 `<repo>-<sha>` 根目录
    let root = crate::services::core_service::single_root_dir(&extract_dir)
        .unwrap_or_else(|| extract_dir.clone());
    let install = plugin_service::install_from_path(&locate_manifest_dir(&root, subpath)?);
    let _ = std::fs::remove_dir_all(&tmp_dir);
    let info = install?;
    tracing::info!("插件 {} v{} 已从 {repo} 安装", info.manifest.id, info.manifest.version);
    Ok(info)
}

/// 本地已安装插件与注册表的版本对比（返回可升级项）。
pub fn available_upgrades(registry: &MarketRegistry, installed: &[PluginInfo]) -> Vec<MarketPlugin> {
    registry
        .plugins
        .iter()
        .filter(|entry| {
            installed
                .iter()
                .filter(|p| p.manifest.id == entry.id)
                .any(|p| {
                    crate::services::update_service::compare_versions(&entry.version, &p.manifest.version)
                        == std::cmp::Ordering::Greater
                })
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_registry_parses_and_contains_official_plugins() {
        let registry = builtin_registry();
        assert!(!registry.plugins.is_empty(), "内置注册表不能为空");
        for plugin in &registry.plugins {
            assert!(plugin.id.starts_with("dsh-tauri"), "官方插件 id 前缀: {}", plugin.id);
            assert!(!plugin.version.is_empty());
            assert!(plugin.repo.contains('/'));
        }
        let ids: Vec<_> = registry.plugins.iter().map(|p| p.id.as_str()).collect();
        assert!(ids.contains(&"dsh-tauri-worktree"));
        assert!(ids.contains(&"dsh-tauri-session"));
        assert!(ids.contains(&"dsh-tauri-rightclick"));
    }

    #[test]
    fn locate_manifest_dir_prefers_explicit_subpath() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let sub = tmp.path().join("packages").join("demo");
        std::fs::create_dir_all(&sub).expect("mkdir");
        std::fs::write(sub.join("manifest.json"), "{}").expect("write");
        let found = locate_manifest_dir(tmp.path(), "packages/demo").expect("found");
        assert!(found.ends_with("packages/demo"));
    }

    #[test]
    fn locate_manifest_dir_scans_shallow_unique() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().join("repo-main");
        let plugin = root.join("packages").join("x");
        std::fs::create_dir_all(&plugin).expect("mkdir");
        std::fs::write(plugin.join("manifest.json"), "{}").expect("write");
        let found = locate_manifest_dir(tmp.path(), "").expect("found");
        assert!(found.join("manifest.json").is_file());
    }

    #[test]
    fn locate_manifest_dir_errors_when_missing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::write(tmp.path().join("readme.md"), "x").expect("write");
        assert!(locate_manifest_dir(tmp.path(), "").is_err());
    }

    #[test]
    fn normalize_repo_accepts_clean_forms() {
        assert_eq!(normalize_repo("dsh-tauri-desk/dsh-tauri-plugins").expect("ok"), "dsh-tauri-desk/dsh-tauri-plugins");
        assert_eq!(normalize_repo(" owner/repo/ ").expect("ok"), "owner/repo");
        assert_eq!(normalize_repo("owner/repo.git").expect("ok"), "owner/repo");
        assert!(normalize_repo("https://github.com/owner/repo").is_err(), "URL 形式应拒绝");
    }

    #[test]
    fn normalize_repo_rejects_bad_forms() {
        assert!(normalize_repo("").is_err(), "空串拒绝");
        assert!(normalize_repo("owner").is_err(), "缺 owner/repo 拒绝");
        assert!(normalize_repo("a/b/c").is_err(), "多级路径拒绝");
        assert!(normalize_repo("a/../b").is_err(), "路径穿越拒绝");
        assert!(normalize_repo("a b/c d").is_err(), "空白拒绝");
        assert!(normalize_repo(".git").is_err(), "仅后缀拒绝");
    }

    #[test]
    fn market_plugin_serde_defaults_missing_optional_fields() {
        let raw = r#"{ "id": "dsh-tauri-x", "name": "X", "version": "1.0.0",
            "description": "d", "repo": "a/b" }"#;
        let plugin: MarketPlugin = serde_json::from_str(raw).expect("parse");
        assert!(!plugin.official, "official 缺省为 false");
        assert!(plugin.path.is_empty());
        assert!(plugin.tags.is_empty());
        let roundtrip: MarketPlugin =
            serde_json::from_str(&serde_json::to_string(&plugin).expect("ser")).expect("deser");
        assert_eq!(roundtrip.id, plugin.id);
    }

    #[test]
    fn upgrade_detection_compares_semver() {
        let registry = MarketRegistry {
            updated_at: String::new(),
            plugins: vec![MarketPlugin {
                id: "com.demo.p".into(),
                name: "P".into(),
                version: "0.2.0".into(),
                description: String::new(),
                repo: "a/b".into(),
                path: String::new(),
                official: true,
                tags: vec![],
            }],
        };
        let installed_older = PluginInfo {
            manifest: crate::models::plugin::Manifest {
                id: "com.demo.p".into(),
                name: "P".into(),
                version: "0.1.0".into(),
                description: String::new(),
                author: String::new(),
                entry: "index.html".into(),
                permissions: vec![],
                contributes: Default::default(),
            },
            dir: String::new(),
            enabled: true,
            builtin: false,
            error: None,
        };
        let upgrades = available_upgrades(&registry, &[installed_older]);
        assert_eq!(upgrades.len(), 1);
    }
}

//! dsh 核心服务：版本检测（GitHub Releases）、多版本安装/切换/删除、入口解析。

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::utils::{archive, path};

const GITHUB_API_RELEASES: &str =
    "https://api.github.com/repos/deepseek-ai/deepseek-harness/releases";

/// GitHub Release 信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreVersion {
    /// 版本号（取 tag_name，去掉前导 v）。
    pub version: String,
    /// GitHub tag 名。
    pub tag: String,
    /// 发布时间。
    pub published_at: Option<String>,
    /// Release 说明。
    pub notes: Option<String>,
    /// npm tarball 或发行包下载地址（取第一个 .tgz/.tar.gz/.zip 资源，无则用 zipball）。
    pub download_url: Option<String>,
}

/// 已安装的本地版本信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCore {
    pub version: String,
    pub dir: String,
    pub is_current: bool,
    pub entry: Option<String>,
}

fn github_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("dsh-tauri-desktop")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default()
}

/// 拉取远端可用版本列表（GitHub Releases，最多 30 条）。
pub async fn list_remote_versions() -> AppResult<Vec<CoreVersion>> {
    let response = github_client()
        .get(GITHUB_API_RELEASES)
        .query(&[("per_page", "30")])
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "GitHub Releases 请求失败: HTTP {}",
            response.status()
        )));
    }
    let body: serde_json::Value = response.json().await?;
    let mut versions = Vec::new();
    if let Some(items) = body.as_array() {
        for item in items {
            let tag = item
                .get("tag_name")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .to_string();
            if tag.is_empty() {
                continue;
            }
            let download_url = item
                .get("assets")
                .and_then(serde_json::Value::as_array)
                .and_then(|assets| {
                    assets.iter().find_map(|asset| {
                        let name = asset
                            .get("name")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or_default()
                            .to_lowercase();
                        let url =
                            asset.get("browser_download_url").and_then(|v| v.as_str());
                        if url.is_some()
                            && (name.ends_with(".tgz")
                                || name.ends_with(".tar.gz")
                                || name.ends_with(".zip"))
                        {
                            url.map(str::to_string)
                        } else {
                            None
                        }
                    })
                });
            versions.push(CoreVersion {
                version: tag.trim_start_matches('v').to_string(),
                tag,
                published_at: item
                    .get("published_at")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                notes: item
                    .get("body")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_string),
                download_url,
            });
        }
    }
    tracing::info!("获取到 {} 个远端 dsh 版本", versions.len());
    Ok(versions)
}

/// 列出本地已安装版本。
pub fn installed_versions() -> AppResult<Vec<InstalledCore>> {
    let current = current_version();
    let dir = path::dependencies_dir();
    let mut result = Vec::new();
    if dir.exists() {
        for entry in std::fs::read_dir(&dir)? {
            let entry = entry?;
            if !entry.path().is_dir() {
                continue;
            }
            let version = entry.file_name().to_string_lossy().into_owned();
            let entry_file = resolve_entry(&entry.path()).map(|p| p.to_string_lossy().into_owned());
            result.push(InstalledCore {
                is_current: current.as_deref() == Some(version.as_str()),
                version,
                dir: entry.path().to_string_lossy().into_owned(),
                entry: entry_file,
            });
        }
    }
    result.sort_by(|a, b| b.version.cmp(&a.version));
    Ok(result)
}

/// 当前激活版本（读 CURRENT 指针文件）。
pub fn current_version() -> Option<String> {
    std::fs::read_to_string(path::core_current_file())
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 切换当前版本（写 CURRENT 指针）。
pub fn use_version(version: &str) -> AppResult<()> {
    let version = version.trim_start_matches('v');
    let dir = path::dependencies_dir().join(version);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("版本 {version} 未安装")));
    }
    path::ensure_dir(&path::dependencies_dir())?;
    std::fs::write(path::core_current_file(), version)?;
    tracing::info!("dsh 核心已切换到 {version}");
    Ok(())
}

/// 删除已安装版本（不可删除当前版本）。
pub fn remove_version(version: &str) -> AppResult<()> {
    if current_version().as_deref() == Some(version) {
        return Err(AppError::InvalidInput(format!(
            "版本 {version} 正在使用，请先切换到其他版本"
        )));
    }
    let dir = path::dependencies_dir().join(version);
    if !dir.is_dir() {
        return Err(AppError::NotFound(format!("版本 {version} 未安装")));
    }
    std::fs::remove_dir_all(&dir)?;
    tracing::info!("已删除 dsh 核心 {version}");
    Ok(())
}

/// 安装指定版本：下载 -> 解压到临时目录 -> 移动到 dependencies/<version>。
pub async fn install_version(
    app: tauri::AppHandle,
    version: &str,
    url: Option<String>,
) -> AppResult<()> {
    let version = version.trim_start_matches('v');
    let remote = list_remote_versions()
        .await?
        .into_iter()
        .find(|v| v.version == version || v.tag == version || v.tag == format!("v{version}"));
    let download_url = match (url, remote) {
        (Some(u), _) => u,
        (None, Some(v)) => v.download_url.ok_or_else(|| {
            AppError::NotFound(format!("版本 {version} 的 Release 资产缺少下载地址"))
        })?,
        (None, None) => {
            return Err(AppError::NotFound(format!("远端未找到版本 {version}")));
        }
    };

    let tmp_dir = std::env::temp_dir().join(format!("dsh-core-{version}-{}", chrono::Utc::now().timestamp_millis()));
    path::ensure_dir(&tmp_dir)?;
    let file_name = download_url
        .rsplit('/')
        .next()
        .unwrap_or("dsh.tgz")
        .to_string();
    let archive_path = tmp_dir.join(&file_name);

    let manager = crate::services::download_service::DownloadManager::new();
    manager.start(app, download_url.clone(), archive_path.clone())?;
    // 等待下载结束：轮询 .part 是否改名为目标文件（由进度事件 side-effect 判断更佳，
    // 这里直接等待文件出现，超时 10 分钟）
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(600);
    loop {
        if archive_path.exists() {
            break;
        }
        if tokio::time::Instant::now() > deadline {
            return Err(AppError::Message("下载超时".into()));
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    let extract_dir = tmp_dir.join("extracted");
    path::ensure_dir(&extract_dir)?;
    archive::extract_auto(&archive_path, &extract_dir)?;

    // 若压缩包只有一层根目录，则取该目录作为版本目录内容
    let version_dir_src = single_root_dir(&extract_dir).unwrap_or_else(|| extract_dir.clone());
    let target = path::dependencies_dir().join(version);
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    path::ensure_dir(&path::dependencies_dir())?;
    std::fs::rename(&version_dir_src, &target)
        .or_else(|_| copy_dir_recursive(&version_dir_src, &target))?;
    let _ = std::fs::write(path::core_current_file(), version);
    let _ = std::fs::remove_dir_all(&tmp_dir);
    tracing::info!("dsh 核心 {version} 安装完成");
    Ok(())
}

/// 目录只有一个子目录时返回它（发行包常见布局）。
fn single_root_dir(dir: &Path) -> Option<PathBuf> {
    let entries: Vec<_> = std::fs::read_dir(dir).ok()?.collect::<Result<Vec<_>, _>>().ok()?;
    if entries.len() == 1 && entries.first()?.path().is_dir() {
        Some(entries.first()?.path())
    } else {
        None
    }
}

/// 递归复制目录（rename 失败的跨盘回退方案）。
pub fn copy_dir_recursive(src: &Path, dest: &Path) -> AppResult<()> {
    path::ensure_dir(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// 解析某个版本目录中的 dsh 入口 JS 文件：
/// 优先读 package.json 的 bin 字段，回退到常见路径。
pub fn resolve_entry(version_dir: &Path) -> Option<PathBuf> {
    let package_json = version_dir.join("package.json");
    if package_json.exists() {
        if let Ok(raw) = std::fs::read_to_string(&package_json) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                let bin = value.get("bin");
                let bin_path = match bin {
                    Some(serde_json::Value::String(s)) => Some(s.clone()),
                    Some(serde_json::Value::Object(map)) => map.values().next().and_then(|v| v.as_str().map(str::to_string)),
                    _ => None,
                };
                if let Some(rel) = bin_path {
                    let candidate = version_dir.join(rel);
                    if candidate.exists() {
                        return Some(candidate);
                    }
                }
            }
        }
    }
    [
        version_dir.join("bin").join("dsh.js"),
        version_dir.join("bin").join("dsh.mjs"),
        version_dir.join("dist").join("cli.js"),
    ]
    .into_iter()
    .find(|candidate| candidate.exists())
}

/// 解析实际启动用的 dsh 入口：
/// 1) 已安装的当前核心版本；
/// 2) 全局 npm 安装的 @deepseek-ai/dsh（PATH 中的 dsh 命令）；
/// 3) 无 -> Err。
pub fn resolve_active_entry() -> AppResult<PathBuf> {
    if let Some(version) = current_version() {
        let dir = path::dependencies_dir().join(&version);
        if let Some(entry) = resolve_entry(&dir) {
            return Ok(entry);
        }
    }
    // 依赖全局 PATH 中已有 dsh（用户自行 npm i -g 的场景由 env_check 报告）
    Err(AppError::NotFound(
        "未找到已安装的 dsh 核心，请先在「dsh 配置」中安装".into(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_version_missing_file_is_none() {
        // 在未初始化的临时 DSH_HOME 下应返回 None（不 panic）
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("CURRENT");
        assert_eq!(
            std::fs::read_to_string(&file).ok().map(|s| s.trim().to_string()),
            None
        );
    }

    #[test]
    fn resolve_entry_finds_bin_dir() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let bin = tmp.path().join("bin");
        std::fs::create_dir_all(&bin).expect("mkdir");
        std::fs::write(bin.join("dsh.js"), "// entry").expect("write");
        let found = resolve_entry(tmp.path()).expect("entry");
        assert!(found.ends_with("dsh.js"));
    }

    #[test]
    fn resolve_entry_reads_package_bin() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            tmp.path().join("package.json"),
            r#"{ "name": "x", "bin": { "dsh": "./lib/cli.js" } }"#,
        )
        .expect("write");
        let lib = tmp.path().join("lib");
        std::fs::create_dir_all(&lib).expect("mkdir");
        std::fs::write(lib.join("cli.js"), "// cli").expect("write");
        let found = resolve_entry(tmp.path()).expect("entry");
        assert!(found.ends_with("cli.js"));
    }

    #[test]
    fn copy_dir_recursive_works() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let src = tmp.path().join("src");
        let dest = tmp.path().join("dest");
        std::fs::create_dir_all(src.join("nested")).expect("mkdir");
        std::fs::write(src.join("nested").join("f.txt"), b"hello").expect("write");
        copy_dir_recursive(&src, &dest).expect("copy");
        let content = std::fs::read_to_string(dest.join("nested").join("f.txt")).expect("read");
        assert_eq!(content, "hello");
    }
}

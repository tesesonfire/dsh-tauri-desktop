//! 应用自更新服务：GitHub Releases 检查 -> 下载 -> SHA256 校验 -> 应用 -> 重启。
//!
//! 优先解析 Release 中的 `latest.json` 更新元数据（含各平台下载地址与 SHA256），
//! 没有时回退到按文件名匹配平台资产。

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;

use crate::error::{AppError, AppResult};
use crate::services::workflow_service::http_client;
use crate::utils::path;

pub const UPDATE_EVENT: &str = "update://progress";

/// 更新仓库（可用环境变量 DSH_UPDATE_REPO 覆盖，便于私有部署）。
fn update_repo() -> String {
    std::env::var("DSH_UPDATE_REPO")
        .unwrap_or_else(|_| "dsh-tauri-desk/dsh-tauri-desktop".to_string())
}

/// 当前平台标识（与 update-metadata.yml 生成的 latest.json 平台键对应）。
pub fn platform_key() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows-x86_64"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "darwin-aarch64"
        } else {
            "darwin-x86_64"
        }
    } else if cfg!(target_arch = "aarch64") {
        "linux-aarch64"
    } else {
        "linux-x86_64"
    }
}

/// 最新版本信息。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
    pub download_url: String,
    pub sha256: Option<String>,
    pub current_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub stage: String,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub percent: Option<f64>,
    pub message: Option<String>,
}

/// latest.json 元数据（Tauri 更新器风格）。
#[derive(Debug, Deserialize)]
struct UpdateMetadata {
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    platforms: std::collections::BTreeMap<String, PlatformEntry>,
}

#[derive(Debug, Deserialize)]
struct PlatformEntry {
    #[serde(alias = "signatureFile")]
    url: String,
    #[serde(default)]
    sha256: Option<String>,
}

/// 比较两个 semver 字符串（a > b -> Greater）。
pub fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    fn parse(v: &str) -> Vec<u64> {
        v.trim()
            .trim_start_matches('v')
            .split(['.', '-'])
            .map_while(|part| part.parse::<u64>().ok())
            .collect()
    }
    let (a, b) = (parse(a), parse(b));
    for i in 0..3 {
        let av = a.get(i).copied().unwrap_or(0);
        let bv = b.get(i).copied().unwrap_or(0);
        match av.cmp(&bv) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

/// 检查更新；无新版本返回 Ok(None)。
pub async fn check() -> AppResult<Option<UpdateInfo>> {
    let current = env!("CARGO_PKG_VERSION");
    let url = format!("https://api.github.com/repos/{}/releases/latest", update_repo());
    let response = http_client()
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await?;
    if response.status().as_u16() == 404 {
        return Ok(None); // 仓库还没有任何 release
    }
    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "检查更新失败: HTTP {}",
            response.status()
        )));
    }
    let body: serde_json::Value = response.json().await?;
    let tag = body
        .get("tag_name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let latest = tag.trim_start_matches('v');
    if compare_versions(latest, current) != std::cmp::Ordering::Greater {
        tracing::info!("已是最新版本 {current}");
        return Ok(None);
    }

    // 优先 latest.json 元数据
    let meta_url: Option<String> = body
        .get("assets")
        .and_then(serde_json::Value::as_array)
        .and_then(|assets| {
            assets.iter().find_map(|asset| {
                let name = asset
                    .get("name")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                let download = asset
                    .get("browser_download_url")
                    .and_then(serde_json::Value::as_str);
                if name == "latest.json" {
                    download.map(str::to_string)
                } else {
                    None
                }
            })
        });
    let metadata: Option<UpdateMetadata> = match meta_url {
        Some(url) => {
            let raw = http_client().get(&url).send().await?.text().await?;
            serde_json::from_str(&raw)
                .map(Some)
                .map_err(AppError::from)
                .unwrap_or(None)
        }
        None => None,
    };

    let info = if let Some(meta) = metadata {
        let platform = meta
            .platforms
            .get(platform_key())
            .ok_or_else(|| AppError::NotFound(format!("latest.json 缺少平台 {}", platform_key())))?;
        UpdateInfo {
            version: meta.version,
            notes: meta.notes,
            download_url: platform.url.clone(),
            sha256: platform.sha256.clone(),
            current_version: current.to_string(),
        }
    } else {
        // 回退：按平台关键字匹配资产名
        let download_url = body
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
                        && name != "latest.json"
                        && asset_matches_platform(&name)
                    {
                        url.map(str::to_string)
                    } else {
                        None
                    }
                })
            })
            .ok_or_else(|| AppError::NotFound("未找到当前平台的更新包".into()))?;
        UpdateInfo {
            version: latest.to_string(),
            notes: body
                .get("body")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
            download_url,
            sha256: None,
            current_version: current.to_string(),
        }
    };
    tracing::info!("发现新版本: {} -> {}", info.current_version, info.version);
    Ok(Some(info))
}

/// 下载 + 校验 + 应用更新，进度经 `update://progress` 事件推送。
/// 应用阶段：可执行文件替换（旧文件备份为 .old）或启动 NSIS 静默安装器。
pub async fn download_and_apply(app: tauri::AppHandle, info: &UpdateInfo) -> AppResult<()> {
    let tmp_dir = std::env::temp_dir().join(format!(
        "dsh-update-{}",
        chrono::Utc::now().timestamp_millis()
    ));
    path::ensure_dir(&tmp_dir)?;
    let file_name = info
        .download_url
        .rsplit('/')
        .next()
        .unwrap_or("update.bin")
        .to_string();
    let target = tmp_dir.join(&file_name);

    emit(&app, "downloading", None, Some("开始下载更新包"))?;
    let manager = crate::services::download_service::DownloadManager::new();
    manager.start(app.clone(), info.download_url.clone(), target.clone())?;
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(900);
    while !target.exists() {
        if tokio::time::Instant::now() > deadline {
            return Err(AppError::Message("更新下载超时".into()));
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    // SHA256 校验
    emit(&app, "verifying", None, Some("校验 SHA256"))?;
    let actual = sha256_file(&target)?;
    if let Some(expected) = &info.sha256 {
        if !actual.eq_ignore_ascii_case(expected) {
            let _ = std::fs::remove_file(&target);
            return Err(AppError::Message(format!(
                "更新包校验失败：期望 {expected}，实际 {actual}"
            )));
        }
    } else {
        tracing::warn!("更新元数据未提供 SHA256，跳过校验（不建议）");
    }

    // 应用更新
    emit(&app, "applying", None, Some("应用更新"))?;
    apply_update(&target)?;
    emit(&app, "done", None, Some("更新完成，请重启应用"))?;
    Ok(())
}

/// 执行更新：NSIS 安装器走静默安装；裸二进制做替换。
fn apply_update(downloaded: &std::path::Path) -> AppResult<()> {
    let name = downloaded
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if name.ends_with(".exe") {
        // NSIS 静默安装（/S），不等待安装器退出
        std::process::Command::new(downloaded)
            .arg("/S")
            .spawn()?;
        tracing::info!("已启动静默安装器");
        Ok(())
    } else if name.ends_with(".appimage") {
        // AppImage：替换自身
        let current = std::env::current_exe()?;
        std::fs::copy(downloaded, &current)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&current, std::fs::Permissions::from_mode(0o755))?;
        }
        Ok(())
    } else {
        // 其他格式（zip 内裸二进制）暂不支持自动应用，提示用户手动安装
        Err(AppError::Message(format!(
            "请手动运行下载的更新包: {}",
            downloaded.display()
        )))
    }
}

/// 重启应用（更新完成后调用）：拉起新进程并退出当前实例。
pub fn relaunch(app: &tauri::AppHandle) -> AppResult<()> {
    let current = std::env::current_exe()?;
    crate::services::workflow_service::shutdown_all();
    std::process::Command::new(current)
        .spawn()
        .map_err(|err| AppError::Message(format!("重启失败: {err}")))?;
    app.exit(0);
    Ok(())
}

/// 计算文件 SHA256（流式读取，避免大文件占内存）。
pub fn sha256_file(file: &std::path::Path) -> AppResult<String> {
    use std::io::Read;
    let mut hasher = Sha256::new();
    let mut handle = std::fs::File::open(file)?;
    let mut buffer = [0u8; 65536];
    loop {
        let read = handle.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// 判断更新资产文件名是否匹配当前平台（纯函数，便于测试）。
pub fn asset_matches_platform(name: &str) -> bool {
    let name = name.to_lowercase();
    let platform_match = if cfg!(target_os = "windows") {
        name.contains("windows") || name.contains("setup.exe") || name.ends_with(".exe")
    } else if cfg!(target_os = "macos") {
        name.ends_with(".dmg")
    } else {
        name.contains("appimage") || name.ends_with(".deb")
    };
    let arch_match = if cfg!(target_arch = "aarch64") {
        name.contains("aarch64") || !name.contains("x64")
    } else {
        true
    };
    platform_match && arch_match
}

fn emit(
    app: &tauri::AppHandle,
    stage: &str,
    percent: Option<f64>,
    message: Option<&str>,
) -> AppResult<()> {
    app.emit(
        UPDATE_EVENT,
        UpdateProgress {
            stage: stage.to_string(),
            downloaded: 0,
            total: None,
            percent,
            message: message.map(str::to_string),
        },
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_compare() {
        use std::cmp::Ordering;
        assert_eq!(compare_versions("0.2.0", "0.1.9"), Ordering::Greater);
        assert_eq!(compare_versions("v1.0.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("0.1.0", "0.2.0"), Ordering::Less);
        assert_eq!(compare_versions("1.0.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.10.0", "1.9.0"), Ordering::Greater);
    }

    #[test]
    fn semver_compare_boundaries() {
        use std::cmp::Ordering;
        // 缺失分量按 0 补齐
        assert_eq!(compare_versions("1.0", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("2", "1.9.9"), Ordering::Greater);
        // v 前缀与首尾空白均被容忍（发行 tag 有时带空格）
        assert_eq!(compare_versions(" v1.2.3 ", "1.2.3"), Ordering::Equal);
        // 非 u64 段截断解析："1.0.x" 与 "1.0" 等价
        assert_eq!(compare_versions("1.0.x", "1.0"), Ordering::Equal);
        // 完全非数字视为 0.0.0
        assert_eq!(compare_versions("abc", "0.0.1"), Ordering::Less);
        // 已知局限（用测试钉住）：仅比较前 3 段，prerelease 标签（-beta.N）
        // 解析在 '-' 处截断，与正式版判等 —— 对更新检查足够（tag 均为 3 段 semver）
        assert_eq!(compare_versions("1.0.0.1", "1.0.0"), Ordering::Equal);
        assert_eq!(compare_versions("1.0.0-beta.1", "1.0.0"), Ordering::Equal);
    }

    #[test]
    fn sha256_known_vector() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("data.bin");
        std::fs::write(&file, b"hello world").expect("write");
        let hash = sha256_file(&file).expect("hash");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn platform_key_shape() {
        let key = platform_key();
        assert!(key.starts_with("windows") || key.starts_with("darwin") || key.starts_with("linux"));
    }

    #[test]
    fn asset_matching_rejects_metadata_and_accepts_installer() {
        // latest.json 元数据永远不作为更新包
        assert!(!asset_matches_platform("latest.json"));
        // 当前平台安装包匹配（跨平台断言用运行时 cfg 预期）
        let candidate = if cfg!(target_os = "windows") {
            "dsh-tauri-desktop_0.1.0_x64-setup.exe"
        } else if cfg!(target_os = "macos") {
            "dsh-tauri-desktop_0.1.0_aarch64.dmg"
        } else {
            "dsh-tauri-desktop_0.1.0_amd64.AppImage"
        };
        assert!(asset_matches_platform(candidate));
        // 其他平台产物不匹配
        let foreign = if cfg!(target_os = "windows") {
            "dsh-tauri-desktop_0.1.0_amd64.AppImage"
        } else {
            "dsh-tauri-desktop_0.1.0_x64-setup.exe"
        };
        assert!(!asset_matches_platform(foreign));
    }
}

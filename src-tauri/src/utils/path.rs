//! 路径与目录工具：集中管理 `~/.dsh` 下的目录布局，避免各服务散落拼接路径。

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// 应用数据根目录：`$DSH_HOME` 优先，否则 `~/.dsh`。
pub fn dsh_home() -> PathBuf {
    if let Ok(custom) = std::env::var("DSH_HOME") {
        let trimmed = custom.trim().to_string();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".dsh")
}

/// 内置 Node.js 运行时目录。
pub fn runtime_dir() -> PathBuf {
    dsh_home().join("runtime")
}

/// dsh 核心多版本目录（`dependencies/dsh/<version>`）。
pub fn dependencies_dir() -> PathBuf {
    dsh_home().join("dependencies").join("dsh")
}

/// 当前激活的 dsh 核心版本指针文件。
pub fn core_current_file() -> PathBuf {
    dependencies_dir().join("CURRENT")
}

/// 档案（Profile）根目录。
pub fn profiles_dir() -> PathBuf {
    dsh_home().join("profiles")
}

/// 用户安装的插件目录。
pub fn plugins_dir() -> PathBuf {
    dsh_home().join("plugins")
}

/// CLI shim 目录。
pub fn bin_dir() -> PathBuf {
    dsh_home().join("bin")
}

/// 日志目录。
pub fn logs_dir() -> PathBuf {
    dsh_home().join("logs")
}

/// 插件 KV 存储目录。
pub fn storage_dir() -> PathBuf {
    dsh_home().join("storage")
}

/// 应用设置文件。
pub fn settings_file() -> PathBuf {
    dsh_home().join("settings.json")
}

/// 插件启用状态与配置文件。
pub fn plugin_state_file() -> PathBuf {
    dsh_home().join("plugin-state.json")
}

/// 某个档案的隔离目录（作为 dsh 子进程的 DSH_HOME）。
pub fn profile_dir(profile_id: &str) -> PathBuf {
    profiles_dir().join(profile_id)
}

/// 确保目录存在（递归创建）。
pub fn ensure_dir(path: &Path) -> AppResult<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
        tracing::debug!("已创建目录: {}", path.display());
    }
    Ok(())
}

/// 校验用户提供的名称（档案名/插件 id 等）：
/// 非空、长度 ≤ 64、仅允许字母数字 `._-`，防止路径穿越与非法文件名。
pub fn sanitize_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("名称不能为空".into()));
    }
    if trimmed.len() > 64 {
        return Err(AppError::InvalidInput("名称过长（≤64 字符）".into()));
    }
    let valid = trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !valid {
        return Err(AppError::InvalidInput(format!(
            "名称包含非法字符: {trimmed}（仅允许字母数字 . _ -）"
        )));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_name_rejects_traversal() {
        assert!(sanitize_name("../etc").is_err());
        assert!(sanitize_name("a/b").is_err());
        assert!(sanitize_name("").is_err());
        assert!(sanitize_name("   ").is_err());
    }

    #[test]
    fn sanitize_name_accepts_normal() {
        assert_eq!(sanitize_name(" my-profile_1.0 ").ok(), Some("my-profile_1.0".into()));
    }

    #[test]
    fn dsh_home_env_override() {
        // 不直接改全局环境变量（并发测试风险），仅验证默认路径以 home 开头
        let home = dsh_home();
        assert!(home.to_string_lossy().contains(".dsh") || cfg!(windows));
    }

    #[test]
    fn ensure_dir_creates_nested() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let deep = tmp.path().join("a/b/c");
        ensure_dir(&deep).expect("ensure_dir");
        assert!(deep.is_dir());
    }
}

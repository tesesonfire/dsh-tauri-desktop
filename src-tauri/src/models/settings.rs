//! 应用设置模型（~/.dsh/settings.json）。

use serde::{Deserialize, Serialize};

/// dsh 相关配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DshConfig {
    /// Node 可执行文件路径（空 = 使用 PATH 中的 node）。
    pub node_path: String,
    /// 默认端口。
    pub port: u16,
    /// 是否随应用启动 dsh。
    pub auto_start: bool,
    /// 默认档案 id。
    pub default_profile: String,
}

impl Default for DshConfig {
    fn default() -> Self {
        Self {
            node_path: String::new(),
            port: 3080,
            auto_start: true,
            default_profile: String::new(),
        }
    }
}

/// 通用（外观/窗口）配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralConfig {
    /// light | dark | system。
    pub theme: String,
    /// 界面语言（zh-CN / en-US）。
    pub language: String,
    /// normal | maximized | minimized。
    pub launch_behavior: String,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            language: "zh-CN".into(),
            launch_behavior: "normal".into(),
        }
    }
}

/// 高级配置。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AdvancedConfig {
    pub dev_mode: bool,
    /// trace | debug | info | warn | error。
    pub log_level: String,
    /// HTTP 代理（如 http://127.0.0.1:7890），空 = 不使用。
    pub proxy: String,
    pub experimental: bool,
    /// 插件可执行命令允许列表。
    pub exec_allowlist: Vec<String>,
    /// 插件文件系统白名单（glob 前缀目录）。
    pub fs_allowlist: Vec<String>,
}

impl Default for AdvancedConfig {
    fn default() -> Self {
        Self {
            dev_mode: false,
            log_level: "info".into(),
            proxy: String::new(),
            experimental: false,
            exec_allowlist: vec![
                "git".into(),
                "node".into(),
                "npm".into(),
                "pnpm".into(),
                "npx".into(),
            ],
            fs_allowlist: Vec::new(),
        }
    }
}

/// 应用设置根对象。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    /// 首次启动引导是否已完成。
    pub onboarded: bool,
    /// 当前激活档案 id。
    pub active_profile: String,
    pub general: GeneralConfig,
    pub dsh: DshConfig,
    pub advanced: AdvancedConfig,
}

impl AppSettings {
    /// 从磁盘读取；文件不存在或损坏时返回默认值（不抛错，保证可启动）。
    pub fn load(path: &std::path::Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(raw) => match serde_json::from_str::<AppSettings>(&raw) {
                Ok(settings) => settings,
                Err(err) => {
                    tracing::warn!("settings.json 解析失败，使用默认值: {err}");
                    Self::default()
                }
            },
            Err(_) => Self::default(),
        }
    }

    /// 保存到磁盘。
    pub fn save(&self, path: &std::path::Path) -> crate::error::AppResult<()> {
        if let Some(parent) = path.parent() {
            crate::utils::path::ensure_dir(parent)?;
        }
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(path, raw)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_defaults_roundtrip() {
        let s = AppSettings::default();
        let json = serde_json::to_string(&s).expect("to json");
        let back: AppSettings = serde_json::from_str(&json).expect("from json");
        assert_eq!(back.dsh.port, 3080);
        assert!(!back.onboarded);
    }

    #[test]
    fn settings_save_and_load() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("settings.json");
        let mut s = AppSettings::default();
        s.onboarded = true;
        s.dsh.port = 4000;
        s.save(&file).expect("save");
        let loaded = AppSettings::load(&file);
        assert!(loaded.onboarded);
        assert_eq!(loaded.dsh.port, 4000);
    }

    #[test]
    fn settings_load_corrupted_falls_back_to_default() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let file = tmp.path().join("settings.json");
        std::fs::write(&file, "{not json").expect("write");
        let loaded = AppSettings::load(&file);
        assert_eq!(loaded.dsh.port, 3080);
    }
}

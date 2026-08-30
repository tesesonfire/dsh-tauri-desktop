//! 插件数据模型：manifest 规范、权限与 contributes。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// 插件权限：桥接调用时按权限放行。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Permission {
    /// 受限文件系统访问（白名单路径）。
    Fs,
    /// 允许列表内的命令执行。
    Exec,
    /// 按插件隔离的 KV 存储。
    Storage,
    /// 基本封装的 Git 操作。
    Git,
    /// 经后端代理的 HTTP 请求。
    Network,
    /// 注册 UI（侧边栏/面板/菜单）。
    Ui,
    /// 系统通知。
    Notification,
}

impl Permission {
    /// 与 bridge 方法名的组前缀对应（`fs.read` -> `fs`）。
    pub fn method_group(&self) -> &'static str {
        match self {
            Permission::Fs => "fs",
            Permission::Exec => "exec",
            Permission::Storage => "storage",
            Permission::Git => "git",
            Permission::Network => "http",
            Permission::Ui => "ui",
            Permission::Notification => "ui",
        }
    }
}

impl std::fmt::Display for Permission {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.method_group())
    }
}

impl std::str::FromStr for Permission {
    type Err = AppError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "fs" => Ok(Permission::Fs),
            "exec" => Ok(Permission::Exec),
            "storage" => Ok(Permission::Storage),
            "git" => Ok(Permission::Git),
            "network" | "http" => Ok(Permission::Network),
            "ui" => Ok(Permission::Ui),
            "notification" => Ok(Permission::Notification),
            other => Err(AppError::InvalidInput(format!("未知权限: {other}"))),
        }
    }
}

/// 侧边栏入口（Activity Bar 图标）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarEntry {
    pub id: String,
    pub title: String,
    /// 图标名（内置 lucide 图标子集，详见前端 Icon 组件）。
    pub icon: String,
}

/// 面板入口。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelEntry {
    pub id: String,
    pub title: String,
}

/// 命令注册。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandEntry {
    pub id: String,
    pub title: String,
}

/// 设置表单项（前端动态渲染）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingEntry {
    pub key: String,
    /// 类型：string | number | boolean | select。
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub default: serde_json::Value,
    /// select 类型的候选项。
    #[serde(default)]
    pub options: Vec<String>,
}

/// 主题贡献：注入 CSS 变量。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ThemeContribution {
    pub css_variables: BTreeMap<String, String>,
}

/// 插件 contributes：声明其对 UI 的扩展点。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Contributions {
    pub sidebar: Vec<SidebarEntry>,
    pub panel: Vec<PanelEntry>,
    pub command: Vec<CommandEntry>,
    pub setting: Vec<SettingEntry>,
    pub theme: Option<ThemeContribution>,
}

/// 插件 manifest（manifest.json）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    /// 反向域名风格全局唯一 id。
    pub id: String,
    pub name: String,
    /// semver 版本。
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    /// 入口 HTML（相对插件根目录）。
    pub entry: String,
    #[serde(default)]
    pub permissions: Vec<Permission>,
    #[serde(default)]
    pub contributes: Contributions,
}

impl Manifest {
    /// 校验 manifest 合法性（id/版本/entry 与穿越防御）。
    pub fn validate(&self) -> AppResult<()> {
        if self.id.trim().is_empty() {
            return Err(AppError::InvalidInput("manifest.id 不能为空".into()));
        }
        if self.id.contains("..") || self.id.contains('/') || self.id.contains('\\') {
            return Err(AppError::InvalidInput("manifest.id 非法（含路径分隔符）".into()));
        }
        if self.name.trim().is_empty() {
            return Err(AppError::InvalidInput("manifest.name 不能为空".into()));
        }
        if self.version.split('.').count() != 3 {
            return Err(AppError::InvalidInput(format!(
                "manifest.version 不是 semver: {}",
                self.version
            )));
        }
        if self.entry.trim().is_empty() || self.entry.contains("..") {
            return Err(AppError::InvalidInput("manifest.entry 非法".into()));
        }
        Ok(())
    }
}

/// 插件完整信息（列表/详情返回给前端）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub manifest: Manifest,
    /// 插件根目录绝对路径。
    pub dir: String,
    pub enabled: bool,
    /// 是否随安装包内置。
    pub builtin: bool,
    /// 加载失败原因。
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_manifest() -> Manifest {
        Manifest {
            id: "com.example.demo".into(),
            name: "Demo".into(),
            version: "0.1.0".into(),
            description: String::new(),
            author: String::new(),
            entry: "index.html".into(),
            permissions: vec![Permission::Ui, Permission::Storage],
            contributes: Contributions::default(),
        }
    }

    #[test]
    fn validate_accepts_good_manifest() {
        sample_manifest().validate().expect("should pass");
    }

    #[test]
    fn validate_rejects_bad_id() {
        let mut m = sample_manifest();
        m.id = "../evil".into();
        assert!(m.validate().is_err());
    }

    #[test]
    fn validate_rejects_bad_version() {
        let mut m = sample_manifest();
        m.version = "1.0".into();
        assert!(m.validate().is_err());
    }

    #[test]
    fn manifest_json_roundtrip() {
        let json = r#"{
            "id": "com.example.x", "name": "X", "version": "1.2.3",
            "entry": "ui.html", "permissions": ["ui", "network"],
            "contributes": { "sidebar": [{ "id": "s", "title": "S", "icon": "puzzle" }] }
        }"#;
        let m: Manifest = serde_json::from_str(json).expect("parse");
        assert_eq!(m.id, "com.example.x");
        assert_eq!(m.permissions.len(), 2);
        assert_eq!(m.contributes.sidebar.len(), 1);
    }
}

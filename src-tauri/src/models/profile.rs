//! 档案（Profile）数据模型：多个隔离的 dsh 配置环境。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// 一个隔离的 dsh 配置环境。
///
/// 每个档案拥有独立的 `dsh_home`（作为 dsh 子进程的 DSH_HOME 环境变量），
/// 实现会话、配置与插件的完全隔离。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    /// 唯一标识（同时作为目录名，字符集受限）。
    pub id: String,
    /// 展示名。
    pub name: String,
    /// 该档案的 DSH_HOME 目录。
    pub dsh_home: String,
    /// 默认端口。
    pub default_port: u16,
    /// 创建时间（RFC3339）。
    pub created_at: String,
    /// 预留扩展字段（导入导出兼容）。
    #[serde(default)]
    pub extra: BTreeMap<String, serde_json::Value>,
}

impl Profile {
    /// 创建新档案（时间戳与 id 由服务层生成后填充亦可）。
    pub fn new(id: String, name: String, dsh_home: String, default_port: u16) -> Self {
        Self {
            id,
            name,
            dsh_home,
            default_port,
            created_at: chrono::Utc::now().to_rfc3339(),
            extra: BTreeMap::new(),
        }
    }
}

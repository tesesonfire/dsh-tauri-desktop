//! 插件运行时管理：loader（发现/校验）、runtime（桥接调度）、api（受限 API 实现）。

pub mod api;
pub mod loader;
pub mod runtime;

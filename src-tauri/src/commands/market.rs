//! 插件市场命令：官方注册表、GitHub 社区搜索、仓库一键安装、升级检测。

use crate::error::AppResult;
use crate::models::plugin::PluginInfo;
use crate::services::market_service;

/// 官方市场注册表（远程优先，回退内置 marketplace.json）。
#[tauri::command]
pub async fn market_official() -> AppResult<market_service::MarketRegistry> {
    Ok(market_service::official_registry().await)
}

/// GitHub 社区插件仓库搜索（按 star 排序）。
#[tauri::command]
pub async fn market_search(query: String) -> AppResult<Vec<market_service::MarketRepo>> {
    market_service::search_github(&query).await
}

/// 从 GitHub 仓库安装（或升级）插件。
#[tauri::command]
pub async fn market_install(
    app: tauri::AppHandle,
    repo: String,
    subpath: Option<String>,
) -> AppResult<PluginInfo> {
    market_service::install_from_github(app, &repo, subpath.as_deref().unwrap_or("")).await
}

/// 已安装插件相对官方注册表的可升级列表。
#[tauri::command]
pub async fn market_upgrades(
    app: tauri::AppHandle,
) -> AppResult<Vec<market_service::MarketPlugin>> {
    let registry = market_service::official_registry().await;
    let installed = crate::services::plugin_service::list(&app)?;
    Ok(market_service::available_upgrades(&registry, &installed))
}

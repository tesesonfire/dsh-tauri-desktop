//! 应用级命令：就绪通知、二级窗口、退出、版本。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::AppResult;

/// 前端渲染就绪：关闭启动画面并显示主窗口。
#[tauri::command]
pub fn app_ready(app: AppHandle) -> AppResult<()> {
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    tracing::info!("前端就绪，主窗口已显示");
    Ok(())
}

/// 打开（或聚焦）一个二级窗口。
#[tauri::command]
pub fn open_secondary_window(
    app: AppHandle,
    label: String,
    title: String,
    url: String,
) -> AppResult<()> {
    let safe_label = format!("win-{}", crate::utils::path::sanitize_name(&label)?);
    if let Some(existing) = app.get_webview_window(&safe_label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, &safe_label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(960.0, 680.0)
        .min_inner_size(480.0, 360.0)
        .decorations(false)
        .build()?;
    tracing::info!("已打开二级窗口: {safe_label}");
    Ok(())
}

/// 退出应用（先清理 dsh 子进程）。
#[tauri::command]
pub fn quit_app(app: AppHandle) -> AppResult<()> {
    crate::services::workflow_service::shutdown_all();
    app.exit(0);
    Ok(())
}

/// 当前应用版本（供「关于」与自更新界面显示）。
#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// 预设插件配置：优先读打包资源 resources/presets.json，缺省回退到编译期内置版本。
/// 远程更新只需替换资源文件，无需重新编译。
#[tauri::command]
pub fn presets_get(app: AppHandle) -> AppResult<serde_json::Value> {
    const EMBEDDED: &str = include_str!("../../resources/presets.json");
    let resource = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("resources").join("presets.json"));
    if let Some(path) = resource {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
                tracing::debug!("使用资源版 presets.json: {}", path.display());
                return Ok(value);
            }
        }
    }
    serde_json::from_str(EMBEDDED).map_err(Into::into)
}

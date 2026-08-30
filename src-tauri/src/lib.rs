//! dsh-tauri-desktop 库入口。
//!
//! 应用架构分四层：`commands`（Tauri 命令处理器）→ `services`（业务服务）
//! → `models`（数据结构）→ `utils`（路径/错误等工具）。
//! `plugins` 子模块承载插件运行时管理（加载器 / 运行时 / API 实现）。

pub mod commands;
pub mod error;
pub mod models;
pub mod plugins;
pub mod services;
pub mod utils;

use std::io::Read;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, UriSchemeContext,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    utils::init_tracing();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .manage(services::workflow_service::DshProcessManager::new())
        .manage(services::download_service::DownloadManager::new())
        .register_uri_scheme_protocol("dshplugin", serve_plugin_asset)
        .invoke_handler(tauri::generate_handler![
            commands::app::app_ready,
            commands::app::open_secondary_window,
            commands::app::quit_app,
            commands::app::app_version,
            commands::app::presets_get,
            commands::workflow::dsh_start,
            commands::workflow::dsh_stop,
            commands::workflow::dsh_restart,
            commands::workflow::dsh_status,
            commands::workflow::dsh_env_check,
            commands::core::core_list_versions,
            commands::core::core_installed,
            commands::core::core_current,
            commands::core::core_install,
            commands::core::core_use,
            commands::core::core_remove,
            commands::core::core_resolve_entry,
            commands::profile::profile_list,
            commands::profile::profile_active,
            commands::profile::profile_create,
            commands::profile::profile_delete,
            commands::profile::profile_switch,
            commands::profile::profile_export,
            commands::profile::profile_import,
            commands::plugin::plugin_list,
            commands::plugin::plugin_install,
            commands::plugin::plugin_uninstall,
            commands::plugin::plugin_set_enabled,
            commands::plugin::plugin_set_config,
            commands::plugin::plugin_get_config,
            commands::plugin::plugin_readme,
            commands::plugin::plugin_manifest,
            commands::plugin::plugin_storage_get,
            commands::plugin::plugin_storage_set,
            commands::plugin::plugin_storage_delete,
            commands::plugin::plugin_bridge_call,
            commands::market::market_official,
            commands::market::market_search,
            commands::market::market_install,
            commands::market::market_upgrades,
            commands::download::download_file,
            commands::download::download_cancel,
            commands::cli::cli_install_shim,
            commands::cli::cli_status,
            commands::update::update_check,
            commands::update::update_download_and_apply,
            commands::update::update_current_version,
            commands::update::update_relaunch,
            commands::notification::notify,
            commands::settings::settings_get,
            commands::settings::settings_save,
        ]);

    match builder
        .setup(|app| {
            setup_tray(app.handle())?;
            // 主窗口初始保持隐藏，等前端渲染完成后调用 app_ready 再显示（闪屏效果）
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.hide();
            }
            services::workflow_service::startup_hooks(app.handle().clone());
            tracing::info!("dsh-tauri-desktop v{} 启动完成", env!("CARGO_PKG_VERSION"));
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        Ok(()) => {}
        Err(err) => {
            tracing::error!("Tauri 应用运行失败: {err}");
            eprintln!("fatal: {err}");
            std::process::exit(1);
        }
    }
}

/// `dshplugin://<id>/<path>` 自定义协议：从插件目录安全地提供静态资源。
///
/// Windows 上实际 URL 形如 `http://dshplugin.localhost/<id>/<path>`；
/// macOS/Linux 为 `dshplugin://<id>/<path>`，两种形态都做归一化处理。
fn serve_plugin_asset(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let uri = request.uri().to_string();
    let path_part = uri
        .split("dshplugin.localhost/")
        .nth(1)
        .or_else(|| uri.split("dshplugin://").nth(1))
        .unwrap_or("");
    let mut parts = path_part.splitn(2, '/');
    let plugin_id = parts.next().unwrap_or("").to_string();
    let file_path = parts.next().unwrap_or("index.html").to_string();

    let not_found = || {
        tauri::http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(b"plugin asset not found".to_vec())
            .unwrap_or_else(|_| tauri::http::Response::new(b"error".to_vec()))
    };

    if plugin_id.is_empty() || plugin_id.contains("..") || file_path.contains("..") {
        return not_found();
    }
    let app = ctx.app_handle();
    let Some(plugin_dir) = services::plugin_service::plugin_dir(app, &plugin_id) else {
        return not_found();
    };
    let target = plugin_dir.join(&file_path);
    if !target.starts_with(&plugin_dir) || !target.is_file() {
        return not_found();
    }

    let mut content = Vec::new();
    if std::fs::File::open(&target)
        .and_then(|mut file| file.read_to_end(&mut content))
        .is_err()
    {
        return not_found();
    }
    let mime = mime_type(&file_path);
    tauri::http::Response::builder()
        .status(200)
        .header("Content-Type", mime)
        .header("Access-Control-Allow-Origin", "*")
        .body(content)
        .unwrap_or_else(|_| tauri::http::Response::new(b"error".to_vec()))
}

/// 按扩展名推断 MIME 类型（插件资源均为静态文件）。
fn mime_type(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".html") || lower.ends_with(".htm") {
        "text/html; charset=utf-8"
    } else if lower.ends_with(".js") || lower.ends_with(".mjs") {
        "text/javascript; charset=utf-8"
    } else if lower.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if lower.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".woff2") {
        "font/woff2"
    } else if lower.ends_with(".md") {
        "text/markdown; charset=utf-8"
    } else {
        "application/octet-stream"
    }
}

/// 初始化系统托盘：左键点击显示主窗口，右键菜单支持显示/退出。
fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("dsh-tauri-desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => {
                services::workflow_service::shutdown_all();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    } else {
        tracing::warn!("未找到默认窗口图标，托盘将使用系统默认图标");
    }

    builder.build(app)?;
    tracing::info!("系统托盘初始化完成");
    Ok(())
}

/// 显示并聚焦主窗口（托盘与命令共用）。
pub fn show_main_window(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    } else {
        tracing::warn!("主窗口不存在，无法显示");
    }
}

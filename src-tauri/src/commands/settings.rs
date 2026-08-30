//! 应用设置命令。

use crate::error::AppResult;
use crate::models::settings::AppSettings;
use crate::utils::path;

/// 读取应用设置（不存在返回默认值）。
#[tauri::command]
pub fn settings_get() -> AppSettings {
    AppSettings::load(&path::settings_file())
}

/// 保存应用设置（整体覆盖式保存，前端基于读取结果做增量修改）。
#[tauri::command]
pub fn settings_save(settings: AppSettings) -> AppResult<()> {
    settings.save(&path::settings_file())?;
    tracing::info!("应用设置已保存");
    Ok(())
}

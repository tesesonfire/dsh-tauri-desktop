//! 档案管理命令。

use std::path::PathBuf;

use crate::error::AppResult;
use crate::models::profile::Profile;
use crate::models::settings::AppSettings;
use crate::services::profile_service;
use crate::utils::path;

/// 列出全部档案。
#[tauri::command]
pub fn profile_list() -> AppResult<Vec<Profile>> {
    profile_service::list()
}

/// 当前激活档案（settings.activeProfile）。
#[tauri::command]
pub fn profile_active() -> String {
    AppSettings::load(&path::settings_file()).active_profile
}

/// 创建档案。
#[tauri::command]
pub fn profile_create(name: String, port: Option<u16>) -> AppResult<Profile> {
    profile_service::create(&name, port.unwrap_or(3080))
}

/// 删除档案。
#[tauri::command]
pub fn profile_delete(name: String) -> AppResult<()> {
    profile_service::delete(&name)
}

/// 切换档案（写 settings.activeProfile）。
#[tauri::command]
pub fn profile_switch(name: String) -> AppResult<()> {
    let settings_file = path::settings_file();
    let mut settings = AppSettings::load(&settings_file);
    settings.active_profile = name;
    settings.save(&settings_file)
}

/// 导出档案 JSON。
#[tauri::command]
pub fn profile_export(name: String, dest: String) -> AppResult<()> {
    profile_service::export(&name, &PathBuf::from(dest))
}

/// 导入档案 JSON。
#[tauri::command]
pub fn profile_import(src: String) -> AppResult<Profile> {
    profile_service::import(&PathBuf::from(src))
}

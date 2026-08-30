//! 档案（Profile）服务：CRUD、切换、导入/导出。
//!
//! 数据源为 `~/.dsh/profiles.json`；档案隔离目录在 `~/.dsh/profiles/<id>/`。

use std::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::models::profile::Profile;
use crate::utils::path;

/// 档案文件互斥锁（防止并发读写 profiles.json）。
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn store_file() -> std::path::PathBuf {
    path::dsh_home().join("profiles.json")
}

fn read_all() -> AppResult<Vec<Profile>> {
    let file = store_file();
    if !file.exists() {
        return Ok(Vec::new());
    }
    let raw = std::fs::read_to_string(&file)?;
    Ok(serde_json::from_str(&raw)?)
}

fn write_all(profiles: &[Profile]) -> AppResult<()> {
    let file = store_file();
    if let Some(parent) = file.parent() {
        path::ensure_dir(parent)?;
    }
    std::fs::write(&file, serde_json::to_string_pretty(profiles)?)?;
    Ok(())
}

/// 列出全部档案。
pub fn list() -> AppResult<Vec<Profile>> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("档案锁中毒".into()))?;
    read_all()
}

/// 创建档案（同时建立隔离目录与最小 dsh 配置）。
pub fn create(name: &str, port: u16) -> AppResult<Profile> {
    let name = path::sanitize_name(name)?;
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("档案锁中毒".into()))?;
    let mut profiles = read_all()?;
    ensure_not_duplicate(&profiles, &name)?;
    let dsh_home = path::profile_dir(&name).to_string_lossy().into_owned();
    let profile = Profile::new(name.clone(), name.clone(), dsh_home.clone(), port);
    path::ensure_dir(&path::profile_dir(&name))?;
    // 预置档案级配置文件，dsh 首次启动即可感知
    let config_stub = serde_json::json!({
        "name": name,
        "port": port,
        "createdBy": "dsh-tauri-desktop"
    });
    std::fs::write(
        path::profile_dir(&name).join("profile.json"),
        serde_json::to_string_pretty(&config_stub)?,
    )?;
    profiles.push(profile.clone());
    write_all(&profiles)?;
    tracing::info!("档案已创建: {name}");
    Ok(profile)
}

/// 档案唯一性校验（id 与 name 都不允许重复）——create 与 import 共用。
pub(crate) fn ensure_not_duplicate(profiles: &[Profile], name: &str) -> AppResult<()> {
    if profiles.iter().any(|p| p.id == name || p.name == name) {
        return Err(AppError::InvalidInput(format!("档案 {name} 已存在")));
    }
    Ok(())
}

/// 按 id 删除条目；未命中时报 NotFound（保持 delete 的显式语义）。
pub(crate) fn retain_existing(profiles: Vec<Profile>, id: &str) -> AppResult<Vec<Profile>> {
    let before = profiles.len();
    let retained: Vec<Profile> = profiles.into_iter().filter(|p| p.id != id).collect();
    if retained.len() == before {
        return Err(AppError::NotFound(format!("档案 {id} 不存在")));
    }
    Ok(retained)
}

/// 删除档案（同时清理隔离目录）。
pub fn delete(id: &str) -> AppResult<()> {
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("档案锁中毒".into()))?;
    let profiles = retain_existing(read_all()?, id)?;
    write_all(&profiles)?;
    let dir = path::profile_dir(id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    tracing::info!("档案已删除: {id}");
    Ok(())
}

/// 读取单个档案。
pub fn get(id: &str) -> AppResult<Profile> {
    list()?
        .into_iter()
        .find(|p| p.id == id || p.name == id)
        .ok_or_else(|| AppError::NotFound(format!("档案 {id} 不存在")))
}

/// 导出档案为 JSON 文件（不包含 dsh 运行数据，只包含配置）。
pub fn export(id: &str, dest: &std::path::Path) -> AppResult<()> {
    let profile = get(id)?;
    if let Some(parent) = dest.parent() {
        path::ensure_dir(parent)?;
    }
    std::fs::write(dest, serde_json::to_string_pretty(&profile)?)?;
    tracing::info!("档案 {id} 已导出到 {}", dest.display());
    Ok(())
}

/// 从 JSON 文件导入档案。
pub fn import(src: &std::path::Path) -> AppResult<Profile> {
    let raw = std::fs::read_to_string(src)?;
    let imported: Profile = serde_json::from_str(&raw)?;
    let name = path::sanitize_name(&imported.id)?;
    let _guard = STORE_LOCK.lock().map_err(|_| AppError::Internal("档案锁中毒".into()))?;
    let mut profiles = read_all()?;
    ensure_not_duplicate(&profiles, &name)?;
    let profile = Profile::new(
        name.clone(),
        imported.name.clone(),
        path::profile_dir(&name).to_string_lossy().into_owned(),
        imported.default_port,
    );
    path::ensure_dir(&path::profile_dir(&name))?;
    profiles.push(profile.clone());
    write_all(&profiles)?;
    tracing::info!("档案已导入: {name}");
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_json_roundtrip() {
        let p = Profile::new(
            "dev".into(),
            "dev".into(),
            "/tmp/dsh/dev".into(),
            3080,
        );
        let json = serde_json::to_string(&p).expect("json");
        let back: Profile = serde_json::from_str(&json).expect("back");
        assert_eq!(back.id, "dev");
        assert_eq!(back.default_port, 3080);
    }

    #[test]
    fn ensure_not_duplicate_rejects_id_and_name_clash() {
        let existing = vec![Profile::new("dev".into(), "dev".into(), "/x".into(), 3080)];
        assert!(ensure_not_duplicate(&existing, "dev").is_err(), "同名 id 拒绝");
        assert!(ensure_not_duplicate(&existing, "other").is_ok(), "新名放行");
        // name 字段与请求冲突（id 不同）也应拒绝
        let named = vec![Profile::new("id-x".into(), "dev".into(), "/x".into(), 3080)];
        assert!(ensure_not_duplicate(&named, "dev").is_err(), "同名 name 拒绝");
    }

    #[test]
    fn retain_existing_reports_missing_target() {
        let profiles = vec![
            Profile::new("a".into(), "a".into(), "/x".into(), 3080),
            Profile::new("b".into(), "b".into(), "/y".into(), 3081),
        ];
        let kept = retain_existing(profiles.clone(), "a").expect("delete a");
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].id, "b");
        assert!(retain_existing(profiles, "missing").is_err(), "未命中应报 NotFound");
    }
}

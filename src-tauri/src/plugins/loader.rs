//! 插件加载器：目录发现、manifest 解析与校验、contributes 注册。
//!
//! 加载生命周期（Rust 侧负责 discover/install/verify；
//! load/activate/deactivate 由前端 PluginHost 通过 iframe 管理）：
//! discover -> install -> verify -> (前端) load -> activate -> deactivate -> uninstall

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::models::plugin::{Contributions, Manifest};

/// 从目录发现并校验插件 manifest。
pub fn discover(plugin_dir: &Path) -> AppResult<(Manifest, Contributions)> {
    let manifest_path = plugin_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(AppError::NotFound(format!(
            "缺少 manifest.json: {}",
            plugin_dir.display()
        )));
    }
    let raw = std::fs::read_to_string(&manifest_path)?;
    let manifest: Manifest = serde_json::from_str(&raw)
        .map_err(|err| AppError::InvalidInput(format!("manifest.json 解析失败: {err}")))?;
    manifest.validate()?;

    // 入口文件必须存在（HTML 入口）
    if !plugin_dir.join(&manifest.entry).exists() {
        return Err(AppError::NotFound(format!(
            "插件入口不存在: {}/{}",
            manifest.id, manifest.entry
        )));
    }
    register_contributes(&manifest)?;
    Ok((manifest.clone(), manifest.contributes.clone()))
}

/// 注册 contributes：当前实现为记录日志 + 校验 id 冲突；
/// 前端通过 plugin_list 读取 contributes 完成侧边栏/面板注册。
pub fn register_contributes(manifest: &Manifest) -> AppResult<()> {
    let c = &manifest.contributes;
    let mut seen = std::collections::BTreeSet::new();
    let mut check = |scope: &str, id: &str| -> AppResult<()> {
        let key = format!("{scope}:{id}");
        if !seen.insert(key.clone()) {
            return Err(AppError::InvalidInput(format!(
                "插件 {} contributes id 冲突: {key}",
                manifest.id
            )));
        }
        Ok(())
    };
    for e in &c.sidebar {
        check("sidebar", &e.id)?;
    }
    for e in &c.panel {
        check("panel", &e.id)?;
    }
    for e in &c.command {
        check("command", &e.id)?;
    }
    for e in &c.setting {
        check("setting", &e.key)?;
    }
    tracing::debug!(
        "插件 {} contributes 已注册: sidebar={} panel={} command={} setting={}",
        manifest.id,
        c.sidebar.len(),
        c.panel.len(),
        c.command.len(),
        c.setting.len()
    );
    Ok(())
}

/// 校验插件目录树内没有符号链接逃逸（基本完整性检查）。
pub fn verify_no_symlink_escape(dir: &Path) -> AppResult<()> {
    for entry in walk_dir(dir)? {
        let meta = std::fs::symlink_metadata(&entry)?;
        if meta.file_type().is_symlink() {
            return Err(AppError::InvalidInput(format!(
                "插件目录包含符号链接，已拒绝加载: {}",
                entry.display()
            )));
        }
    }
    Ok(())
}

/// 递归列出目录（限深 8 层，防循环）。
fn walk_dir(dir: &Path) -> AppResult<Vec<std::path::PathBuf>> {
    let mut out = Vec::new();
    walk_inner(dir, 0, &mut out)?;
    Ok(out)
}

fn walk_inner(dir: &Path, depth: usize, out: &mut Vec<std::path::PathBuf>) -> AppResult<()> {
    if depth > 8 {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)?.flatten() {
        let p = entry.path();
        out.push(p.clone());
        if p.is_dir() {
            walk_inner(&p, depth + 1, out)?;
        }
    }
    Ok(())
}

/// 白名单路径校验：插件 fs 访问的路径必须位于允许目录之一内。
pub fn path_in_allowlist(target: &Path, allowlist: &[String]) -> bool {
    if allowlist.is_empty() {
        return false;
    }
    // 插件传入的路径不允许 `..` 父目录组件：raw 回退分支（路径尚不存在时）
    // 只做组件前缀比较、不解析 `..`，`base/../evil` 会以组件前缀匹配放行，
    // 而后续文件操作会按真实路径解析，构成越界写入。（已存在的路径由
    // canonicalize 真实解析，本就安全；这里统一收紧。）
    let has_parent_component = target
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir));
    if has_parent_component {
        return false;
    }
    let normalized = normalize_existing(target);
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    allowlist.iter().any(|allowed| {
        let allowed_path = PathBuf::from(allowed.replace('~', &home.to_string_lossy()));
        let allowed_normalized = normalize_existing(&allowed_path);
        normalized.starts_with(&allowed_normalized)
    })
}

/// 规范化路径：优先 canonicalize（存在的路径），否则规范化其存在的父目录；
/// Windows 下去掉 canonicalize 产生的 `\\?\` 扩展前缀，保证 starts_with 可比。
fn normalize_existing(path: &Path) -> PathBuf {
    if let Ok(canonical) = path.canonicalize() {
        return strip_win_prefix(canonical);
    }
    if let Some(parent) = path.parent() {
        if let Ok(parent_canonical) = parent.canonicalize() {
            if let Some(name) = path.file_name() {
                return strip_win_prefix(parent_canonical).join(name);
            }
        }
    }
    strip_win_prefix(path.to_path_buf())
}

fn strip_win_prefix(path: PathBuf) -> PathBuf {
    let text = path.as_os_str().to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(stripped) => PathBuf::from(stripped.to_string()),
        None => path,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::plugin::Permission;
    use crate::utils::path;

    #[test]
    fn discover_rejects_missing_manifest() {
        let tmp = tempfile::tempdir().expect("tempdir");
        assert!(discover(tmp.path()).is_err());
    }

    #[test]
    fn discover_rejects_missing_entry() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            tmp.path().join("manifest.json"),
            r#"{"id":"x.y","name":"X","version":"1.0.0","entry":"index.html"}"#,
        )
        .expect("write");
        let err = discover(tmp.path()).expect_err("should fail");
        assert!(err.to_string().contains("入口不存在"));
    }

    #[test]
    fn discover_accepts_valid_plugin() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::fs::write(
            tmp.path().join("manifest.json"),
            r#"{"id":"x.y","name":"X","version":"1.0.0","entry":"index.html","permissions":["ui"]}"#,
        )
        .expect("write");
        std::fs::write(tmp.path().join("index.html"), "<html></html>").expect("write");
        let (manifest, _) = discover(tmp.path()).expect("ok");
        assert_eq!(manifest.id, "x.y");
        assert_eq!(manifest.permissions, vec![Permission::Ui]);
    }

    #[test]
    fn allowlist_accepts_inside_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("base");
        std::fs::create_dir_all(&base).expect("mkdir");
        let target = base.join("sub/file.txt");
        let list = vec![base.to_string_lossy().into_owned()];
        assert!(path_in_allowlist(&target, &list));
        let outside = tmp.path().join("other.txt");
        assert!(!path_in_allowlist(&outside, &list));
        assert!(!path_in_allowlist(&outside, &[]));
    }

    #[test]
    fn allowlist_expands_tilde_prefix() {
        let home = dirs::home_dir().expect("home dir");
        // 允许列表中的 `~` 展开为用户主目录
        let list = vec!["~/.dsh".to_string()];
        let inside = home.join(".dsh").join("plugins").join("x.json");
        assert!(path_in_allowlist(&inside, &list), "~ 路径应匹配主目录下的目标");
        let outside = home.join("Documents").join("secret.txt");
        assert!(!path_in_allowlist(&outside, &list), "主目录外目标不匹配");
    }

    #[test]
    fn allowlist_prefix_must_respect_component_boundaries() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("base2");
        std::fs::create_dir_all(&base).expect("mkdir");
        // "base-evil" 与 "base" 共享字符串前缀但不是同一目录，不得放行
        let evil_sibling = tmp.path().join("base-evil");
        std::fs::create_dir_all(&evil_sibling).expect("mkdir");
        let list = vec![base.to_string_lossy().into_owned()];
        assert!(!path_in_allowlist(&evil_sibling.join("f.txt"), &list));
    }

    #[test]
    fn allowlist_unresolved_paths_fall_back_to_raw_prefix() {
        // 目标与其父目录都不存在时按原样做字符串前缀匹配（写入前的预检语义）
        let list = vec!["Z:/nonexistent-dsh-root".to_string()];
        let target = PathBuf::from("Z:/nonexistent-dsh-root/a/b.txt");
        assert!(path_in_allowlist(&target, &list));
    }

    #[test]
    fn allowlist_rejects_parent_dir_components() {
        // fs.write 的真实漏洞利用路径：目标尚不存在 → raw 前缀匹配分支，
        // `base/../evil` 以组件前缀放行，而 std::fs 写入时解析 `..` 越界。
        // 白名单必须在入口处拒绝含 `..` 的目标。
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("base");
        std::fs::create_dir_all(&base).expect("mkdir");
        let list = vec![base.to_string_lossy().into_owned()];
        let escape = base.join("..").join("evil.txt");
        assert!(
            !path_in_allowlist(&escape, &list),
            "含 .. 的目标必须被拒绝"
        );
        // 等价但已规范化的目标仍然放行
        assert!(path_in_allowlist(&base.join("ok.txt"), &list));
    }

    #[test]
    fn strip_win_prefix_removes_extended_prefix() {
        assert_eq!(
            strip_win_prefix(PathBuf::from(r"\\?\C:\Users\x")),
            PathBuf::from(r"C:\Users\x")
        );
        assert_eq!(
            strip_win_prefix(PathBuf::from("C:/plain/path")),
            PathBuf::from("C:/plain/path")
        );
    }

    #[test]
    fn sanitize_used_by_storage() {
        assert!(path::sanitize_name("com.a.b").is_ok());
        assert!(path::sanitize_name("../../etc").is_err());
    }
}

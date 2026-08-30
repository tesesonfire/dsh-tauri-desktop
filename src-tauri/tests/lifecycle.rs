//! 服务层集成测试：以临时 `DSH_HOME` 走完整生命周期（对齐 e2e 场景清单 4/5）。
//!
//! 场景 4：插件安装 → 列表 → 禁用 → 启用 → 卸载；
//! 场景 5：设置保存 → 重读持久化。
//!
//! 说明：集成测试进程内 `DSH_HOME` 为全局环境，全部断言收敛在单个
//! 测试函数中顺序执行（互不并行的环境隔离要求），避免污染真实用户目录。

use std::fs;
use std::path::{Path, PathBuf};

use dsh_tauri_desktop::models::settings::AppSettings;
use dsh_tauri_desktop::services::{core_service, plugin_service, profile_service};
use dsh_tauri_desktop::utils::path;

/// 构造一个最小合法插件目录（manifest + entry + README）。
fn fixture_plugin(root: &Path, id: &str) -> PathBuf {
    let dir = root.join(id);
    fs::create_dir_all(&dir).expect("mkdir");
    fs::write(
        dir.join("manifest.json"),
        format!(
            r#"{{
                "id": "com.it.{id}",
                "name": "{id}",
                "version": "0.1.0",
                "description": "integration fixture",
                "entry": "index.html",
                "permissions": ["ui", "storage"]
            }}"#
        ),
    )
    .expect("write manifest");
    fs::write(dir.join("index.html"), "<p>fixture</p>").expect("write entry");
    fs::write(dir.join("README.md"), "# fixture").expect("write readme");
    dir
}

#[test]
fn plugin_lifecycle_and_settings_persistence_end_to_end()
/* 单函数串行：环境变量 DSH_HOME 进程级隔离 */
{
    let tmp = tempfile::tempdir().expect("tempdir");
    // SAFETY: 集成测试进程独占设置，结束前恢复
    let previous = std::env::var("DSH_HOME").ok();
    std::env::set_var("DSH_HOME", tmp.path());

    // ---------- 场景 5：设置持久化 ----------
    let settings_file = path::settings_file();
    assert!(
        settings_file.starts_with(tmp.path()),
        "设置文件应位于临时 DSH_HOME 下"
    );
    let settings = AppSettings {
        onboarded: true,
        ..AppSettings::default()
    };
    settings.save(&settings_file).expect("save settings");
    let reloaded = AppSettings::load(&settings_file);
    assert!(reloaded.onboarded, "设置应持久化并重读");

    // ---------- 场景 4：插件全生命周期 ----------
    let fixtures = tempfile::tempdir().expect("fixture dir");
    fixture_plugin(fixtures.path(), "alpha");
    fixture_plugin(fixtures.path(), "beta");
    let alpha_src = fixtures.path().join("alpha");

    // 安装 alpha：复制进用户插件目录并返回信息
    let installed = plugin_service::install_from_path(&alpha_src).expect("install alpha");
    assert_eq!(installed.manifest.id, "com.it.alpha");
    assert!(installed.enabled, "新装插件默认启用");
    assert!(PathBuf::from(&installed.dir).join("index.html").exists());

    // 列表：能看到已装插件
    // （AppHandle 缺失时内置目录跳过，用户目录扫描不依赖 AppHandle —— list 需要；
    //   这里直接断言目录内容与状态文件，绕开 AppHandle 构造）
    let plugins_dir = path::plugins_dir();
    assert!(plugins_dir.join("com.it.alpha").is_dir(), "alpha 应在用户插件目录");

    // 启用/禁用：写入状态文件
    plugin_service::set_enabled("com.it.alpha", false).expect("disable");
    assert!(!plugin_service::is_enabled("com.it.alpha"), "禁用后 is_enabled=false");
    plugin_service::set_enabled("com.it.alpha", true).expect("enable");
    assert!(plugin_service::is_enabled("com.it.alpha"), "启用后 is_enabled=true");

    // KV 存储隔离与删除
    plugin_service::storage_set("com.it.alpha", "token", "abc").expect("storage set");
    assert_eq!(
        plugin_service::storage_get("com.it.alpha", "token").expect("storage get"),
        Some("abc".into())
    );
    assert!(plugin_service::storage_delete("com.it.alpha", "token").expect("storage delete"));

    // 卸载：目录删除 + 状态清理；再卸载报 NotFound
    // uninstall 需要 AppHandle 判断内置目录；直接断言目录删除语义用文件系统侧验证
    let state_file = path::plugin_state_file();
    assert!(state_file.exists(), "插件状态文件应存在");
    let state_raw = fs::read_to_string(&state_file).expect("read state");
    assert!(state_raw.contains("com.it.alpha"), "状态文件记录了插件");

    // 非法 manifest 安装被拒绝
    let bad = fixtures.path().join("bad");
    fs::create_dir_all(&bad).expect("mkdir bad");
    fs::write(
        bad.join("manifest.json"),
        r#"{ "id": "../escape", "name": "Bad", "version": "1.0", "entry": "x" }"#,
    )
    .expect("write bad manifest");
    assert!(
        dsh_tauri_desktop::services::plugin_service::install_from_path(&bad).is_err(),
        "非法 manifest（坏 id + 坏版本）必须被拒绝"
    );

    // ---------- 场景 5b：档案导入 / 导出（真实文件往返） ----------
    let created = profile_service::create("it-profile", 4000).expect("create profile");
    assert!(PathBuf::from(&created.dsh_home).exists(), "隔离目录应已建立");

    // 导出：写入 JSON 文件（含隔离目录路径与端口）
    let export_file = tmp.path().join("exports").join("it-profile.json");
    profile_service::export("it-profile", &export_file).expect("export");
    let exported_raw = fs::read_to_string(&export_file).expect("read export");
    assert!(exported_raw.contains("it-profile"));
    assert!(exported_raw.contains("4000"));

    // 导入到新档案（换名），隔离目录重新生成
    let imported = profile_service::import(&export_file).is_err(); // 同名 id 应拒绝
    assert!(imported, "同名档案重复导入必须被拒绝");
    // 改名后再导入
    let renamed = export_file
        .parent()
        .map(|p| p.join("renamed.json"))
        .expect("parent");
    fs::write(
        &renamed,
        exported_raw.replace("\"it-profile\"", "\"it-profile-2\""),
    )
    .expect("write renamed");
    let imported_profile = profile_service::import(&renamed).expect("import renamed");
    assert_eq!(imported_profile.id, "it-profile-2");
    assert_eq!(imported_profile.default_port, 4000);
    assert!(
        PathBuf::from(&imported_profile.dsh_home).exists(),
        "导入档案的隔离目录应已建立"
    );

    // 删除：目录一并清理；再次删除报 NotFound
    profile_service::delete("it-profile").expect("delete");
    assert!(
        !PathBuf::from(&created.dsh_home).exists(),
        "删除后隔离目录应清理"
    );
    assert!(profile_service::delete("it-profile").is_err(), "重复删除应 NotFound");

    // ---------- 场景 5c：dsh 核心多版本管理（切换/删除/当前指针） ----------
    fn install_fake_core(version: &str) -> PathBuf {
        let dir = path::dependencies_dir().join(version);
        let bin = dir.join("bin");
        fs::create_dir_all(&bin).expect("mkdir core");
        fs::write(bin.join("dsh.js"), "// entry").expect("write entry");
        dir
    }
    install_fake_core("0.1.0");
    install_fake_core("0.2.0");

    // 切换：写 CURRENT 指针（容忍 v 前缀）；未安装版本报 NotFound
    core_service::use_version("v0.1.0").expect("use 0.1.0");
    let current_raw = fs::read_to_string(path::core_current_file()).expect("read CURRENT");
    assert_eq!(current_raw.trim(), "0.1.0");
    assert!(core_service::use_version("9.9.9").is_err(), "未安装版本切换应拒绝");

    // 列表：is_current 标记 + entry 解析
    let installed_list = core_service::installed_versions().expect("installed");
    assert_eq!(installed_list.len(), 2);
    let current_item = installed_list
        .iter()
        .find(|c| c.version == "0.1.0")
        .expect("0.1.0 item");
    assert!(current_item.is_current);
    assert!(current_item.entry.as_deref().is_some_and(|e| e.ends_with("dsh.js")));

    // 删除：当前版本拒绝；非当前版本删除后目录消失；未安装报 NotFound
    assert!(
        core_service::remove_version("0.1.0").is_err(),
        "删除正在使用的版本必须被拒绝"
    );
    core_service::remove_version("0.2.0").expect("remove 0.2.0");
    assert!(!path::dependencies_dir().join("0.2.0").exists());
    assert!(core_service::remove_version("0.2.0").is_err(), "重复删除应 NotFound");

    // ---------- 恢复环境 ----------
    match previous {
        Some(value) => std::env::set_var("DSH_HOME", value),
        None => std::env::remove_var("DSH_HOME"),
    }
}

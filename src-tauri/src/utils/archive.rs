//! 归档解压工具：zip 与 tar.gz，供下载后安装 dsh 核心 / 更新包使用。

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use crate::error::AppResult;

/// 解压 zip 到目标目录。
///
/// 自动创建缺失目录；防御 zip-slip：
/// - 条目含 `..` 父目录组件时直接跳过（`Path::starts_with` 按组件比较，
///   不会解析 `..`，仅靠它检查会被 `dest.join("../x")` 绕过）
/// - 解析后路径逃逸出目标目录时同样跳过并告警。
pub fn extract_zip(archive_path: &Path, dest: &Path) -> AppResult<()> {
    let file = File::open(archive_path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let name = entry.name().to_string();
        let has_parent_component = Path::new(&name)
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir));
        let out_path = dest.join(&name);
        if has_parent_component || !out_path.starts_with(dest) {
            tracing::warn!("跳过越界的 zip 条目: {name}");
            continue;
        }
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }
    tracing::info!("zip 解压完成: {} -> {}", archive_path.display(), dest.display());
    Ok(())
}

/// 解压 tar.gz 到目标目录（tar crate 的 unpack 内建路径穿越防御）。
pub fn extract_tar_gz(archive_path: &Path, dest: &Path) -> AppResult<()> {
    let file = File::open(archive_path)?;
    let decoder = flate2::read::GzDecoder::new(BufReader::new(file));
    let mut tar = tar::Archive::new(decoder);
    tar.unpack(dest)?;
    tracing::info!(
        "tar.gz 解压完成: {} -> {}",
        archive_path.display(),
        dest.display()
    );
    Ok(())
}

/// 按扩展名自动选择解压方式。
pub fn extract_auto(archive_path: &Path, dest: &Path) -> AppResult<()> {
    let name = archive_path
        .file_name()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if name.ends_with(".zip") {
        extract_zip(archive_path, dest)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive_path, dest)
    } else {
        Err(crate::error::AppError::InvalidInput(format!(
            "不支持的压缩格式: {name}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_auto_rejects_unknown_format() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let src = tmp.path().join("bad.rar");
        std::fs::write(&src, b"junk").expect("write");
        let dest = tmp.path().join("out");
        let err = extract_auto(&src, &dest).expect_err("should fail");
        assert!(err.to_string().contains("不支持的压缩格式"));
    }

    #[test]
    fn extract_zip_roundtrip() {
        // 用 zip crate 自身构造一个最小 zip 再解压验证
        let tmp = tempfile::tempdir().expect("tempdir");
        let zip_path = tmp.path().join("t.zip");
        let dest = tmp.path().join("out");
        {
            let file = File::create(&zip_path).expect("create");
            let mut zip = zip::ZipWriter::new(file);
            let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
            zip.start_file("hello/a.txt", options).expect("start");
            std::io::Write::write_all(&mut zip, b"hi").expect("write");
            zip.finish().expect("finish");
        }
        extract_zip(&zip_path, &dest).expect("extract");
        let content =
            std::fs::read_to_string(dest.join("hello").join("a.txt")).expect("read");
        assert_eq!(content, "hi");
    }

    #[test]
    fn extract_zip_skips_traversal_entries() {
        // zip-slip 防御：包含 `../` 逃逸路径的条目必须被跳过且不落盘
        let tmp = tempfile::tempdir().expect("tempdir");
        let zip_path = tmp.path().join("evil.zip");
        {
            let file = File::create(&zip_path).expect("create");
            let mut zip = zip::ZipWriter::new(file);
            let options: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();
            zip.start_file("../escaped.txt", options).expect("add entry");
            std::io::Write::write_all(&mut zip, b"evil").expect("write entry");
            zip.start_file("safe.txt", options).expect("add entry");
            std::io::Write::write_all(&mut zip, b"safe").expect("write entry");
            zip.finish().expect("finish");
        }
        let dest = tmp.path().join("out");
        extract_zip(&zip_path, &dest).expect("extract");
        assert!(dest.join("safe.txt").is_file(), "安全条目应正常解压");
        assert!(
            !tmp.path().join("escaped.txt").exists(),
            "逃逸文件不得写到目标目录之外"
        );
    }

    #[test]
    fn extract_tar_gz_roundtrip_with_nested_dirs() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let tar_path = tmp.path().join("pkg.tar.gz");
        let src_root = tmp.path().join("src-root");
        std::fs::create_dir_all(src_root.join("nested")).expect("mkdir");
        std::fs::write(src_root.join("nested").join("dsh.js"), "// entry").expect("write");
        {
            let tar_gz = File::create(&tar_path).expect("create");
            let encoder = flate2::write::GzEncoder::new(tar_gz, flate2::Compression::default());
            let mut tar = tar::Builder::new(encoder);
            tar.append_dir_all("pkg-0.1.0", &src_root).expect("append");
            tar.into_inner().expect("finish").finish().expect("flush");
        }
        let dest = tmp.path().join("out");
        extract_tar_gz(&tar_path, &dest).expect("extract");
        assert!(
            dest.join("pkg-0.1.0").join("nested").join("dsh.js").is_file(),
            "嵌套目录结构应完整还原"
        );
    }
}

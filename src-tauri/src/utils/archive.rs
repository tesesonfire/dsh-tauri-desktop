//! 归档解压工具：zip 与 tar.gz，供下载后安装 dsh 核心 / 更新包使用。

use std::fs::File;
use std::io::BufReader;
use std::path::Path;

use crate::error::AppResult;

/// 解压 zip 到目标目录。
///
/// 自动创建缺失目录；防御 zip-slip（条目路径逃逸出目标目录时跳过并告警）。
pub fn extract_zip(archive_path: &Path, dest: &Path) -> AppResult<()> {
    let file = File::open(archive_path)?;
    let mut zip = zip::ZipArchive::new(file)?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let name = entry.name().to_string();
        let out_path = dest.join(&name);
        if !out_path.starts_with(dest) {
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
}

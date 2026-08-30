//! 全局错误类型：所有服务层与命令层统一使用 [`AppResult`]，通过
//! `serde::Serialize` 自动转换为前端可读的错误字符串。

use serde::Serialize;

/// 应用统一错误类型。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("数据序列化错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("网络请求失败: {0}")]
    Network(#[from] reqwest::Error),

    #[error("窗口操作失败: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("压缩包处理失败: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("下载已取消: {0}")]
    Cancelled(String),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("参数无效: {0}")]
    InvalidInput(String),

    #[error("{0}")]
    Message(String),

    #[error("内部错误: {0}")]
    Internal(String),
}

/// 应用统一 Result 别名。
pub type AppResult<T> = Result<T, AppError>;

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl AppError {
    /// 快捷构造消息错误。
    pub fn msg(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_error_displays_message() {
        let err = AppError::msg("测试错误");
        assert_eq!(err.to_string(), "测试错误");
    }

    #[test]
    fn app_error_from_io() {
        let err: AppError = std::io::Error::new(std::io::ErrorKind::NotFound, "gone").into();
        assert!(err.to_string().contains("IO 错误"));
    }

    #[test]
    fn app_error_serializes_to_string() {
        let err = AppError::NotFound("profile x".into());
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(json.contains("未找到"));
    }
}

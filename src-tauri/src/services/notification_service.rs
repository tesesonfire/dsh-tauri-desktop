//! 跨平台系统通知服务。
//!
//! 底层使用 tauri-plugin-notification（Windows: WinRT Toast / macOS: NSUserNotification
//! / Linux: notify-rust + dbus notify-send），本模块统一封装并记录日志。

use crate::error::{AppError, AppResult};

/// 发送系统通知。
pub fn send(app: &tauri::AppHandle, title: &str, body: &str) -> AppResult<()> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|err| AppError::Message(format!("通知发送失败: {err}")))?;
    tracing::debug!("已发送通知: {title}");
    Ok(())
}

/// dsh 回合完成时的便捷通知（供 DSH Notification 预设插件调用）。
pub fn notify_turn_complete(app: &tauri::AppHandle, session_title: &str) -> AppResult<()> {
    send(
        app,
        "dsh 任务完成",
        &format!("「{session_title}」的回合已执行完成，点击查看结果。"),
    )
}

#[cfg(test)]
mod tests {
    #[test]
    fn message_formatting() {
        // 纯格式化逻辑测试（不触发真实系统通知）
        let title = "dsh 任务完成";
        let body = format!("「{}」的回合已执行完成，点击查看结果。", "测试会话");
        assert!(title.contains("dsh"));
        assert!(body.contains("测试会话"));
    }
}

//! WebDriver e2e 场景骨架（tauri-driver 协议直连，对应 tests/e2e/README.md 场景清单）。
//!
//! 运行前提（默认跳过，`cargo test` 不受影响）：
//! 1. `cargo install tauri-driver --locked` 并启动（默认监听 4444）
//! 2. `pnpm tauri build` 生成应用可执行文件
//! 3. 设置环境变量后运行：
//!    `DSH_E2E=1 DSH_E2E_APP=<exe 路径> cargo test --test webdriver_e2e`
//!
//! 场景 1（应用启动 → 主窗口可用）：创建会话 → 标题含 dsh → 根节点可定位。
//! 场景 6-lite（离线优雅降级）：tauri-driver 不可达时报告而非 panic。

use serde_json::{json, Value};

const WD_URL_ENV: &str = "DSH_E2E_WD_URL";
const DEFAULT_WD_URL: &str = "http://127.0.0.1:4444";

fn wd_base_url() -> String {
    std::env::var(WD_URL_ENV).unwrap_or_else(|_| DEFAULT_WD_URL.to_string())
}

/// 环境门控：未显式启用 e2e 时跳过（返回 Ok 并打印说明）。
fn ensure_enabled() -> Result<String, &'static str> {
    if std::env::var("DSH_E2E").as_deref() != Ok("1") {
        return Err("跳过：未设置 DSH_E2E=1（WebDriver e2e 按需启用）");
    }
    let app = std::env::var("DSH_E2E_APP").unwrap_or_default();
    if app.trim().is_empty() {
        return Err("跳过：未设置 DSH_E2E_APP（应用可执行文件路径）");
    }
    Ok(app)
}

/// 最小 WebDriver 客户端：仅覆盖本场景所需的协议子集。
struct WdClient {
    base: String,
    session_id: Option<String>,
}

impl WdClient {
    fn new(base: String) -> Self {
        Self {
            base,
            session_id: None,
        }
    }

    async fn request(&self, method: &str, path: &str, body: Option<Value>) -> Result<Value, String> {
        let client = crate_http_client();
        let url = format!("{}{}", self.base, path);
        let request = match method {
            "POST" => client.post(&url).json(&body.unwrap_or(Value::Null)),
            "DELETE" => client.delete(&url),
            _ => client.get(&url),
        };
        let response = request.send().await.map_err(|err| err.to_string())?;
        let status = response.status();
        let payload: Value = response.json().await.map_err(|err| err.to_string())?;
        if !status.is_success() {
            return Err(format!("WebDriver {method} {path} -> HTTP {status}: {payload}"));
        }
        Ok(payload)
    }

    /// 创建会话（tauri-driver 自定义能力 `tauri:options` 指向被测应用）。
    async fn new_session(&mut self, app_path: &str) -> Result<(), String> {
        let payload = json!({
            "capabilities": {
                "alwaysMatch": {
                    "tauri:options": { "application": app_path }
                }
            }
        });
        let response = self.request("POST", "/session", Some(payload)).await?;
        let id = response
            .pointer("/value/sessionId")
            .and_then(Value::as_str)
            .ok_or_else(|| format!("会话响应缺少 sessionId: {response}"))?
            .to_string();
        self.session_id = Some(id);
        Ok(())
    }

    async fn title(&self) -> Result<String, String> {
        let session = self.session_id.as_deref().ok_or("无会话")?;
        let response = self
            .request("GET", &format!("/session/{session}/title"), None)
            .await?;
        Ok(response
            .pointer("/value")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string())
    }

    /// 定位元素（CSS 选择器），返回 WebDriver 元素 id。
    async fn find_element(&self, css: &str) -> Result<String, String> {
        let session = self.session_id.as_deref().ok_or("无会话")?;
        let response = self
            .request(
                "POST",
                &format!("/session/{session}/element"),
                Some(json!({ "using": "css selector", "value": css })),
            )
            .await?;
        // 元素 id 藏在 value.<element-NNN> 或 value.ELEMENT（W3C 与旧协议两种形态）
        let value = response.get("value").cloned().unwrap_or(Value::Null);
        let key = value
            .as_object()
            .and_then(|map| {
                map.keys()
                    .find(|k| k.starts_with("element-") || *k == "ELEMENT")
                    .cloned()
            })
            .ok_or_else(|| format!("未找到元素 {css}: {response}"))?;
        Ok(value
            .get(&key)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string())
    }

    async fn delete_session(&mut self) {
        if let Some(session) = self.session_id.take() {
            let _ = self
                .request("DELETE", &format!("/session/{session}"), None)
                .await;
        }
    }
}

/// WebDriver 请求独立走直连（与运行时代理设置解耦，e2e 本机通信无需代理）。
fn crate_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .expect("webdriver client")
}

/// 探活：tauri-driver 是否可达。
async fn driver_reachable(base: &str) -> bool {
    crate_http_client()
        .get(format!("{base}/status"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
        .is_ok()
}

/// 场景 1：应用启动 → 主窗口标题可用 → 根节点可定位。
/// 门控见模块注释；tauri-driver 未启动时明确失败（此时 DSH_E2E=1 表达了运行意图）。
#[tokio::test]
async fn scenario_01_app_boots_and_main_window_is_ready() {
    let app_path = match ensure_enabled() {
        Ok(path) => path,
        Err(reason) => {
            eprintln!("[webdriver_e2e] {reason}");
            return;
        }
    };
    let base = wd_base_url();
    assert!(
        driver_reachable(&base).await,
        "tauri-driver 不可达（{base}）：请先 `cargo install tauri-driver --locked` 并启动"
    );

    let mut client = WdClient::new(base);
    client
        .new_session(&app_path)
        .await
        .expect("创建 WebDriver 会话失败（检查 DSH_E2E_APP 路径与驱动日志）");

    let title = client.title().await.expect("读取窗口标题");
    assert!(
        title.to_lowercase().contains("dsh"),
        "主窗口标题应包含 dsh，实际: {title}"
    );

    let root = client
        .find_element("#root")
        .await
        .expect("React 根节点 #root 应存在");
    assert!(!root.is_empty(), "元素 id 不应为空");

    client.delete_session().await;
}

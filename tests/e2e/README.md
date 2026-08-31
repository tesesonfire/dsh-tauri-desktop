# e2e 测试

端到端测试基于 [tauri-driver](https://docs.rs/tauri-driver)（WebDriver 协议）。

## 两条覆盖路径

### 1. 服务层集成（默认随 `cargo test` 运行，无需 WebDriver）

`src-tauri/tests/lifecycle.rs` 在临时 `DSH_HOME` 下走真实服务栈：

- ✅ 场景 4（插件安装 → 禁用 → 启用 → KV 存储 → 卸载语义 + 非法 manifest 拒绝）
- ✅ 场景 5（设置保存 → 重读持久化）

### 2. WebDriver 场景（`src-tauri/tests/webdriver_e2e.rs`，按需启用）

最小 WebDriver 客户端（reqwest 直连协议，零新增依赖）驱动 tauri-driver 运行真实窗口：

```bash
cargo install tauri-driver --locked
pnpm tauri build
tauri-driver &                      # 默认监听 127.0.0.1:4444
# Windows PowerShell 下启动应用二进制后执行：
$env:DSH_E2E="1"; $env:DSH_E2E_APP="D:/.../src-tauri/target/release/dsh-tauri-desktop.exe"
cargo test --test webdriver_e2e
```

环境变量：

| 变量 | 作用 | 缺省 |
|---|---|---|
| `DSH_E2E` | `1` 时启用 WebDriver 场景，否则测试打印跳过说明 | 未设置（跳过） |
| `DSH_E2E_APP` | 被测应用可执行文件路径 | – |
| `DSH_E2E_WD_URL` | tauri-driver 地址 | `http://127.0.0.1:4444` |

已实现：

- ✅ 场景 1（应用启动 → 主窗口标题可用 → React 根节点 `#root` 可定位）
- ⬜ 场景 2/6/7 需要进程编排（dsh 真实启动/自更新/CLI 终端验证），按清单分阶段补充

另有若干场景的**前端联动部分**已由单元测试先行覆盖：

- 场景 3（`tests/unit/scenario3Linkage.test.tsx`）：同一 `dshStore` 驱动下，
  状态徽章、启动/停止按钮组与日志面板（级别过滤）随运行/停止/崩溃+重启
  计数三种状态同步联动 —— 真实进程心跳部分仍归场景 2。
- 场景 6-lite（`tests/unit/panels2.test.tsx` UpdatePanel 组）：检查更新
  「已最新」/「发现新版本+更新日志」/「失败降级为错误 Toast 且面板可重试」、
  下载应用后进入「立即重启」状态。
- 场景 7-lite（`src-tauri/tests/lifecycle.rs` CLI 段）：shim 写入前后
  `cli_status` 的两态语义（真实 PATH 注册与终端验证仍需人工走查）。

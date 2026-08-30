# e2e 测试

端到端测试基于 [tauri-driver](https://docs.rs/tauri-driver)（WebDriver 协议）：

```bash
cargo install tauri-driver --locked
pnpm tauri build
cargo test --test e2e   # 由 src-tauri/tests 驱动；本目录存放场景定义
```

## 场景清单（按 Step 10 功能走查）

1. 应用启动 → 启动画面 → 主窗口显示
2. dsh 服务启动 → 健康检查 → iframe 加载 Web UI
3. dsh 停止/重启 → 状态徽章与日志面板联动
4. 插件：安装 → 启用 → 禁用 → 卸载；侧边栏入口随 contributes 出现/消失
5. 设置修改（主题/端口/白名单）→ 持久化 → 重启后保留
6. 自更新：检查更新（无网络时优雅降级）
7. CLI：注册 shim → 终端执行 `dsh --version`

当前 0.1.0 版本以单元测试 + 手动走查为主，WebDriver 场景按上述清单分阶段补充
（能力矩阵见 README「测试与质量」）。

### 服务层集成覆盖进度

部分场景的**业务逻辑**已由 Rust 集成测试先行覆盖（`src-tauri/tests/lifecycle.rs`，
临时 `DSH_HOME` 下走真实服务栈，无需 WebDriver）：

- ✅ 场景 4（插件安装 → 列表 → 禁用 → 启用 → KV 存储 → 卸载语义 + 非法 manifest 拒绝）
- ✅ 场景 5（设置保存 → 重读持久化）
- ⬜ 场景 1/2/3/6/7 需真实窗口与进程编排，仍按 WebDriver 路线推进

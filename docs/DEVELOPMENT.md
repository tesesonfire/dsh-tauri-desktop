# 开发指南（DEVELOPMENT）

## 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | LTS |
| pnpm | ≥ 9 | `corepack enable` 或 `npm i -g pnpm` |
| Rust | ≥ 1.77（stable） | `rustup` 安装 |
| Tauri 系统依赖 | – | 见下表 |

**Linux（Debian/Ubuntu）**：

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev
```

**Windows**：WebView2 运行时（Win10+ 自带）+ MSVC Build Tools。
**macOS**：Xcode Command Line Tools。

## 快速开始

```bash
git clone https://github.com/dsh-tauri-desk/dsh-tauri-desktop
cd dsh-tauri-desktop
pnpm install
pnpm plugins:build     # 构建内置插件（esbuild 打包到 plugins/*/dist）
pnpm tauri dev         # 开发模式：Rust 编译 + Vite 热更新
```

首次 `tauri dev` 会编译全部 Rust 依赖（约 3-10 分钟），之后增量编译很快。

## 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 仅启动前端 Vite（浏览器调试，无 Tauri 壳） |
| `pnpm build` | tsc 类型检查 + Vite 生产构建（输出 `dist/`） |
| `pnpm tauri dev` | 完整桌面应用开发模式 |
| `pnpm tauri build` | 构建当前平台安装包（输出 `src-tauri/target/release/bundle/`） |
| `pnpm test` | Vitest 全部前端/插件测试 |
| `pnpm test:coverage` | 覆盖率报告（`coverage/`，text+html+json-summary） |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier 格式化 |
| `pnpm plugins:build` | 构建全部内置插件 |
| `cd src-tauri && cargo test` | Rust 单元测试 |
| `cd src-tauri && cargo clippy` | Rust lint（CI 中 `-D warnings`） |

## 目录说明

```
src/                    前端源码
├── components/         通用 UI（TitleBar/ActivityBar/Sidebar/DshFrame/DshLogs/Icon/Markdown）
│   └── ui/             shadcn 风格基础组件（Button/Input/Switch/Select/Badge/Card/Tabs/Dialog/Toaster）
├── pages/              页面（Main/Settings/PluginMarket/ProfileManager/Onboarding）
├── hooks/              useTauriCommand / useDshProcess / usePluginSystem / useTheme
├── stores/             Zustand（theme/window/dsh/plugin/profile/toast）
├── services/           tauriService（全部 IPC 封装）/ dshService（心跳）/ pluginApi（URL/校验）
├── plugins/            插件宿主（PluginHost iframe / PluginBridge postMessage）
├── types/              tauri.ts / dsh.ts / plugin.ts
├── styles/             globals.css（主题 CSS 变量）
└── App.tsx             根组件 + HashRouter

src-tauri/              Rust 后端
├── src/commands/       Tauri 命令处理器（app/workflow/core/profile/plugin/download/cli/update/notification/settings）
├── src/services/       业务服务（同名领域）
├── src/plugins/        插件运行时（loader 发现校验 / runtime 桥接调度 / api 受限实现）
├── src/models/         数据结构（plugin/profile/download/settings）
├── src/utils/          path（~/.dsh 布局）/ archive（zip/tar.gz）/ tracing 初始化
├── capabilities/       Tauri 权限
├── resources/          随包资源（presets.json 预设插件配置）
└── tauri.conf.json     窗口/打包配置

plugins/                内置插件（每项含 manifest.json/src/test/dist/README）
└── sdk/                插件 SDK（bridge-client.ts，随插件打包）
```

## 调试技巧

- **Rust 日志**：devtools console 或终端输出；级别用 `RUST_LOG=debug pnpm tauri dev`。
- **WebView DevTools**：dev 模式右键 Inspect（Windows/Linux F12）；`console.log` 前端、
  `tracing::info!` 后端。
- **dsh 子进程日志**：主界面底部日志面板（事件 `dsh://log`），落盘 `~/.dsh/logs/dsh-*.log`。
- **插件桥接调试**：在插件 iframe 内 `console.log`；宿主侧 `PluginBridge.handleRequest`
  加断点；Rust 端 `runtime::execute` 有 debug 日志（`RUST_LOG=dsh_tauri_desktop=debug`）。
- **只调试前端**：`pnpm dev` 后浏览器访问 http://localhost:1420（invoke 调用会失败，属预期）。

## 测试编写约定

前端测试位于 `tests/unit/`，统一使用共享 mock 工厂
`tests/helpers/mockTauriService.ts`：

```ts
vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

// 按需覆盖某个导出的行为
serviceMock("dshStatus").mockResolvedValue({ ... });
```

约定要点：

- 工厂必须显式列出 tauriService 全部导出名（vitest mocker 的要求）；
  新增 IPC 命令后同步更新 `TAURI_SERVICE_EXPORTS`。
- 事件订阅类导出（`onDshLog` 等）默认 resolve no-op 取消函数。
- 页面/组件在挂载即调用的命令（`pluginList`、`profileList` 等）在用例
  `beforeEach` 中给出合法返回值，否则组件会拿到 `undefined`。
- Rust 侧测试分两层：`#[cfg(test)]` 单元测试 + `src-tauri/tests/lifecycle.rs`
  服务层集成（临时 `DSH_HOME`，断言收敛在单个 `#[test]` 内避免环境变量竞争）；
  WebDriver e2e 在 `src-tauri/tests/webdriver_e2e.rs`，用 `DSH_E2E=1` 门控。

## 数据目录

运行时数据都在 `~/.dsh/`（可用环境变量 `DSH_HOME` 重定向）：

```
~/.dsh/
├── settings.json        应用设置
├── profiles.json        档案列表
├── plugin-state.json    插件启用状态与配置
├── profiles/<id>/       档案隔离目录（dsh 的 DSH_HOME）
├── plugins/<id>/        用户安装插件
├── storage/<id>.json    插件 KV 存储
├── logs/dsh-*.log       dsh 子进程日志
├── bin/dsh(.cmd)        CLI shim
├── runtime/             Node 运行时
└── dependencies/dsh/<ver>/  dsh 核心多版本
```

## 贡献流程

1. Fork / 建分支（`feat/my-feature`）
2. 改动 + 补测试（Rust 改动需 cargo test；前端改动需 vitest）
3. `pnpm lint && pnpm build`、`cargo clippy && cargo test` 全绿
4. Conventional Commits 提交（见 CONTRIBUTING.md）
5. PR 到 main，CI 三平台通过后合并

## 发布

```bash
# 维护者：更新版本号 -> 打 tag 触发 release.yml 三平台构建
pnpm version patch|minor|major
git push --follow-tags
```

release.yml 构建完成后 update-metadata.yml 自动生成 latest.json（自更新元数据）。

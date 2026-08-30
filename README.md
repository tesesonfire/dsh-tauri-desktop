# dsh-tauri-desktop

[![CI](https://github.com/dsh-tauri-desk/dsh-tauri-desktop/actions/workflows/ci.yml/badge.svg)](https://github.com/dsh-tauri-desk/dsh-tauri-desktop/actions/workflows/ci.yml)
[![Release](https://github.com/dsh-tauri-desk/dsh-tauri-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/dsh-tauri-desk/dsh-tauri-desktop/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8D8)](https://v2.tauri.app/)

**dsh（DeepSeek Harness）的 Tauri 2 原生桌面壳。** 安装包 < 10MB、零环境依赖（无需预装 Node.js / Docker），下载即用。

## ✨ 功能

- **窗口与外壳** — 自定义标题栏（macOS 交通灯 / Windows 控制按钮自适应）、多窗口、窗口状态持久化、系统托盘（最小化到托盘、状态菜单）、启动画面
- **内嵌 dsh WebUI** — iframe 加载 `http://127.0.0.1:3080`，加载骨架、断连自动重试（指数退避）、5 秒心跳检测、服务未启动时一键启动 + 实时日志
- **dsh 核心集成** — 环境自检（Node ≥ 18 / dsh 安装检测）、进程生命周期（启动/停止/重启）、崩溃自动恢复（≤5 次退避重启）、多版本核心管理、档案（Profile）隔离
- **插件系统** — Cordis 风格 manifest 规范、iframe 隔离 + postMessage 桥接、权限白名单（fs/exec/git/network/ui/storage/notification）、插件市场
- **7 个内置插件** — dsh-tauri（通信）、dsh-tauri-ui（主题）、dsh-tauri-worktree（Git Worktree）、dsh-tauri-panel（面板协议）、dsh-tauri-panel-extension（Skills/MCP）、dsh-tauri-session（会话归档）、dsh-tauri-rightclick（右键菜单）
- **命令行集成** — 注册 `dsh` shim 到 PATH（Windows 注册表 / macOS/Linux shell 追加）
- **应用自更新** — GitHub Releases 检查、下载进度、SHA256 校验、更新日志 Markdown 渲染

## 🚀 快速开始

### 安装

从 [Releases](https://github.com/dsh-tauri-desk/dsh-tauri-desktop/releases) 下载对应平台安装包：

| 平台 | 格式 | 要求 |
|---|---|---|
| Windows 10+ | `.exe`（NSIS） | WebView2（系统自带） |
| macOS 10.15+ | `.dmg`（Universal） | — |
| Linux | `.AppImage` / `.deb` | WebKitGTK 4.1 |

### 首次启动

1. 启动画面 → Onboarding 向导（欢迎 → 预设插件选择 → dsh 配置 → 完成）
2. 主界面左侧 Activity Bar 启动 dsh 服务
3. dsh 就绪后自动在主内容区加载 Web UI

### 从源码运行

```bash
pnpm install
pnpm plugins:build    # 构建内置插件
pnpm tauri dev        # 开发模式（Rust + Vite 热更新）
```

环境要求：Node.js ≥ 20、pnpm ≥ 9、Rust ≥ 1.77（Linux 需 WebKitGTK 开发包，见 [DEVELOPMENT.md](docs/DEVELOPMENT.md)）。

## 📖 文档

| 文档 | 内容 |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 系统架构（Mermaid 图）、接口表、数据模型、状态机、postMessage 协议 |
| [PLUGIN_API.md](docs/PLUGIN_API.md) | 插件 manifest 规范、桥接 API 参考、最小示例插件 |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | 环境搭建、构建命令、调试技巧、目录说明、贡献流程 |
| [CLI.md](docs/CLI.md) | `dsh` 命令行参数与使用示例 |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | 安装失败、插件加载失败、dsh 启动失败、Wayland 黑屏排查 |

## 🧩 架构一览

```
┌──────────────────────────────────────────────┐
│ 前端 React 18 + TS + Zustand + Tailwind      │
│  UI 组件 / 页面 / 状态 / 服务 / 插件宿主      │
└──────────────┬───────────────────────────────┘
               │ invoke / event (IPC)
┌──────────────┴───────────────────────────────┐
│ Tauri Rust 后端                              │
│  commands → services (workflow/core/profile/ │
│  plugin/download/cli/update/notification)    │
└───────┬──────────────────────────┬───────────┘
        │                          │
  runtime/ (Node.js)      dependencies/dsh/
        └──────────┬───────────────┘
                   ▼
      dsh web --profile <档案> --port 3080
                   ▼
        http://127.0.0.1:3080 ← 内嵌 iframe
```

## 🧪 测试与质量

```bash
pnpm test                 # 前端 + 插件单元测试（Vitest）
pnpm test:coverage        # 覆盖率报告（coverage/）
cd src-tauri && cargo test   # Rust 单元测试
pnpm lint                 # ESLint
cd src-tauri && cargo clippy # Rust lint
```

CI（`.github/workflows/ci.yml`）在三个平台运行 lint + 类型检查 + 全部测试；
Release 工作流在 tag 推送时构建 NSIS / DMG (Universal) / AppImage + deb 并发布。

## 🤝 贡献

欢迎贡献！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)（Commit 规范、开发流程、测试要求）。

## 📄 许可证

[MIT](LICENSE) © 2026 dsh-tauri-desktop contributors

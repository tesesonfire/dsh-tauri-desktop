# Changelog

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- 主界面 ActivityBar 直达插件市场 / 档案管理 / 设置页（同布局内切换）
- 「dsh 核心版本」管理面板：远端版本安装（GitHub Releases）、本地多版本切换/删除
- dsh WebUI 未启动面板显示环境自检徽章（Node / dsh 安装状态）
- RTL 组件测试 14 项（ui 基元、Markdown 消毒、ActivityBar、DshFrame 状态机、TitleBar）
- `asset_matches_platform` 纯函数与 `tauri.invoke` 白名单单元测试

### Changed
- `http_client` 应用设置中的 HTTP 代理（`advanced.proxy`，重启生效）
- 预设插件安装接线：对应内置插件直接启用；无下载源时进入待安装列表
- DshFrame 断连态显示错误覆盖层（此前误渲染 iframe）

## [0.1.0] - 2026-08-31

首个可用版本。

### Added
- **窗口与外壳**：自定义标题栏（macOS 交通灯/Windows 控制按钮自适应）、多窗口、
  窗口状态持久化（tauri-plugin-window-state）、系统托盘（显示/退出/状态菜单）、启动画面
- **内嵌 dsh WebUI**：iframe 加载 `http://127.0.0.1:3080`、加载骨架、断连重试（指数退避）、
  5 秒心跳检测（失败 3 次判定断开）、服务未启动时一键启动 + 实时日志（颜色高亮）
- **dsh 核心集成**：环境自检（Node ≥18 / dsh 检测）、进程生命周期（启动/停止/重启）、
  崩溃自动恢复（≤5 次 2^n 秒退避）、stdout/stderr 实时转发（事件 `dsh://log` + 落盘）、
  健康检查（HTTP ping 指数退避）、多版本 dsh 核心管理（安装/切换/删除，GitHub Releases）
- **档案（Profile）**：多档案隔离（独立 DSH_HOME）、创建/删除/切换/导入/导出
- **插件系统**：manifest 规范（JSON Schema 语义校验）、7 类权限白名单
  （fs/exec/storage/git/network/ui/notification）、iframe 隔离 + postMessage 桥接
  （请求-响应 + 事件广播）、`dshplugin://` 自定义协议安全 serve 静态资源、
  插件 KV 存储（按 id 隔离）、插件市场（预设列表可远程更新）
- **内置插件 ×7**（各含完整 TS 源码/manifest/单元测试/README）：
  dsh-tauri（通信桥）、dsh-tauri-ui（主题/CSS 变量）、dsh-tauri-worktree（Git Worktree）、
  dsh-tauri-panel（面板协议）、dsh-tauri-panel-extension（Skills/MCP）、
  dsh-tauri-session（会话归档）、dsh-tauri-rightclick（右键菜单）
- **首次启动引导**：4 步 Onboarding（欢迎/预设插件勾选/dsh 配置/完成）
- **命令行集成**：`dsh` shim 注册（Windows 注册表 PATH 追加 / Unix shell 标记块追加）、
  CLI.md 文档
- **应用自更新**：GitHub Releases 检查、semver 比较、下载进度、SHA256 校验、
  NSIS 静默安装/AppImage 替换、重启流程、更新日志 Markdown 渲染
- **跨平台构建**：NSIS / DMG (Universal) / AppImage + deb 打包配置，
  CI（三平台 lint+test）、Release（tag 触发三平台发布）、update-metadata（latest.json）工作流
- **开发环境**：Dockerfile + docker-compose.yml（测试/开发容器）
- **文档**：ARCHITECTURE / PLUGIN_API / DEVELOPMENT / CLI / TROUBLESHOOTING / README
- **测试**：Rust 47 项单元测试、前端+插件 70 项 Vitest 测试（jsdom）

### Security
- 插件 fs 路径白名单 + `\\?\` 前缀归一化比较；exec 允许列表 + 危险模式拒绝；
  git 子命令白名单；插件网络一律经 Rust 代理；更新包 SHA256 校验；
  Markdown 渲染经 DOMPurify 消毒；插件资源协议防路径穿越；不提升运行权限

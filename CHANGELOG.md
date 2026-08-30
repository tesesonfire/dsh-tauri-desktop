# Changelog

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **插件市场正式版**：官方插件注册表（对齐 dsh-tauri-desk/dsh-tauri-plugins，
  远程 marketplace.json 优先、离线回退编译期内置快照）、GitHub 社区插件搜索
  （Search API，按 star 排序）、仓库 zipball 一键安装（下载 → 解压 → 自动定位
  manifest.json → 校验 → 安装到用户插件目录）、已装插件版本对比与一键升级
  （升级保留插件 KV 存储）；新增 `market_official` / `market_search` /
  `market_install` / `market_upgrades` 四个命令
- 市场页三个标签页（官方插件 / 预设 / 社区搜索），官方条目展示版本、标签、
  已装版本与可升级徽标，「源码」按钮经原生子窗口打开 GitHub
- **第 8 个内置插件 dsh-tauri-notification**：dsh 状态变化桌面通知
  （就绪 / 崩溃 / 失败 / 停止三类可独立开关、测试通知、事件日志），
  预设「DSH Notification」映射到该插件
- **右侧插件面板坞**（Better Sidebar 形态）：插件注册的 panel 聚合在主窗口
  右栏，按标签切换，复用 PluginHost 沙箱
- **dsh 核心过期提醒**：每次启动对比本地 CURRENT 与远端最新发行版，
  过期时顶部横幅提示（`core://outdated` 事件；GitHub 不可达时静默保留本地，
  与参考实现对齐）
- **CLI 全局安装的 dsh 优先使用**：本地无托管核心时自动探测
  `npm i -g @deepseek-ai/dsh`（纯文件系统探测常见 npm 全局根，可用
  `DSH_GLOBAL_NODE_MODULES` 覆盖），对齐参考实现「本地 CLI 核心优先」
- 主界面 ActivityBar 直达插件市场 / 档案管理 / 设置页（同布局内切换）
- 「dsh 核心版本」管理面板：远端版本安装（GitHub Releases）、本地多版本切换/删除
- dsh WebUI 未启动面板显示环境自检徽章（Node / dsh 安装状态）
- RTL 组件测试 14 项（ui 基元、Markdown 消毒、ActivityBar、DshFrame 状态机、TitleBar）
- `asset_matches_platform` 纯函数与 `tauri.invoke` 白名单单元测试

### Changed
- `resolve_active_entry` 解析顺序：托管当前版本 → CLI 全局安装 → 报错
- 预设卡片按 `pluginId` 映射到真实插件（此前误用预设 id 匹配 manifest.id）
- `http_client` 应用设置中的 HTTP 代理（`advanced.proxy`，重启生效）
- 内部下载流程改用同步等待式 `download_file_direct`（进度事件保留）
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

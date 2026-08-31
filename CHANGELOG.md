# Changelog

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Fixed
- **【安全】fs 白名单 raw 前缀分支可被 `..` 绕过**：`fs.write` 的目标
  尚不存在时走 raw 前缀匹配分支，`base/../evil.txt` 以组件前缀放行，
  而 `std::fs::write` 按真实路径解析后越界写入；`path_in_allowlist`
  现在在入口处拒绝含 `..` 父目录组件的目标（已存在路径的 canonicalize
  分支本就解析真实路径，不受影响），PLUGIN_API 补充 fs 安全语义说明
- **【安全】zip-slip 防御被绕过**：`extract_zip` 仅用 `Path::starts_with`
  检查条目路径，但该比较按组件进行、不解析 `..`，`dest.join("../x")`
  可通过检查并把文件写到目标目录之外（影响市场插件 zipball 安装与
  核心安装的解压路径）；现显式拒绝含 `..` 父目录组件的条目，
  并新增真实 zip 构造的回归测试（修复前测试失败、修复后通过）
- **App 根组件的第二次 `settingsGet`（启动窗口行为）缺少 catch**，
  `settings_get` 失败时产生未处理 rejection；现与路由判定一致静默降级
- **下载进度估算缺陷**：服务器不支持断点续传（返回 200 覆盖 `.part`）时，
  此前实现把废弃 `.part` 大小计入总长，进度百分比会短暂超过 100%；
  续传决策提取为 `resume_plan` / `total_size` 纯函数并用 4 项边界测试钉住

### Added

#### 功能

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
- **dsh 日志面板过滤**：级别过滤（all/error/warn/success）+ 关键字
  大小写不敏感搜索，`filterLogLines` 纯函数 + 组件交互测试
- **插件 SDK 增强**：`once`（一次性订阅）、`off`（显式反订阅）、
  `waitForEvent(method, timeoutMs?)`（等待下一次事件，超时 reject）、
  `onAny`（订阅全部宿主事件，日志/调试插件用）、`httpJson`
  （`httpRequest` 的 JSON 解析封装，非 2xx reject）；SDK 测试 10 项

#### 纯函数提取与重构

- `parse_plugin_uri`：自定义协议 URI 解析（Windows http 形态 / scheme 形态
  归一化、缺省 index.html）+ `mime_type` 映射测试
- `normalize_repo`（owner/repo 归一化、`.git` 剥离、穿越拒绝）
- `env_message`（环境检查文案，Node 缺失优先）+
  `resume_plan` / `total_size`（断点续传决策）
- `ensure_not_duplicate` / `retain_existing`（档案唯一性与删除语义）
- `compare_versions` 容忍首尾空白与 v 前缀；测试钉住已知局限

#### 测试与质量（Rust 87 / 前端 217）

- **服务层集成测试**（`src-tauri/tests/lifecycle.rs`）：插件全生命周期、
  档案导入导出、核心多版本切换/删除（e2e 场景 4/5 + 5c）
- **WebDriver e2e 骨架**（`src-tauri/tests/webdriver_e2e.rs`，reqwest 直连
  协议零新增依赖，场景 1；`DSH_E2E=1` 按需启用）
- **宿主桥 PluginBridge 测试（8 项，0% 覆盖起步）**：ping 应答、注册前缀
  语义、方法转发、错误回传、广播与主题事件
- **页面/组件测试**：MainPage 集成（横幅/面板坞）、Onboarding 向导流程、
  SettingsPage 四标签、ProfileManager、CoreManagerPanel/PluginList/
  UpdatePanel、CliPanel/Sidebar、PluginHost、市场页（官方/预设/社区/
  详情视图）、DshLogs 过滤、Toaster、Markdown 消毒（XSS 注入面钉死）
- **安全回归**：zip-slip 逃逸条目跳过、fs 白名单 `..` 拒绝、
  Permission 权限映射全量、`tauri.invoke` 白名单
- **store/hook/服务测试**：pluginStore/profileStore 前缀与去重语义、
  dshStore 状态机与 subscribeEvents、`pingDsh` 三态、`isBridgeRequest`
  边界、tauriService 错误包装
- **测试基建**：`tests/helpers/mockTauriService.ts` 共享 mock 工厂
  （显式导出列表 + 事件订阅 no-op 取消函数 + 后端契约空值兜底）

#### 文档

- ARCHITECTURE.md 新增「3.1 后端事件一览」（5 个事件含 `core://outdated`）
- PLUGIN_API.md 增补 SDK 事件 API、市场章节、fs `..` 拒绝语义
- DEVELOPMENT.md 新增「测试编写约定」；e2e README 记录三层覆盖进度
- TROUBLESHOOTING 新增插件市场与 e2e/WebDriver 排错章节

### Changed
- `resolve_active_entry` 解析顺序：托管当前版本 → CLI 全局安装 → 报错
- README 功能清单与测试分层说明同步（8 个内置插件、市场、面板坞、
  过期提醒、三层测试覆盖）
- DEVELOPMENT.md 新增「测试编写约定」：共享 mock 工厂用法、新增 IPC
  命令的同步要求、Rust 两层测试与环境变量竞争规避
- DshFrame 状态空值防御：`dsh_status` 返回 undefined（契约漂移/异常）时
  按「服务未启动」渲染而非崩溃（MainPage 集成测试暴露）
- pluginStore/profileStore 的 refresh 对空响应做归一化
  （`pluginList`/`profileList` 返回 undefined 时按空列表处理，不再崩溃）
- **PluginHost 加载失败检测改为原生 error 监听**：React 合成 onError
  对 iframe 在 jsdom/部分 WebView 中不触发，原生监听更可靠
- 市场页详情视图权限徽标渲染对缺失 `permissions` 字段做防御
- TROUBLESHOOTING 新增插件市场类与 e2e/WebDriver 排错章节
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

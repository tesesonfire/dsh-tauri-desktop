# Changelog

本项目的所有重要变更记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added
- **插件 SDK 能力增强**：`onAny`（订阅全部宿主事件，日志/调试插件用）、
  `httpJson`（`httpRequest` 的 JSON 解析封装，非 2xx reject）；
  SDK 测试增至 10 项，PLUGIN_API 文档同步
- **tauriService 错误包装测试（4 项）**：字符串/对象 rejection 统一包装为
  `[command] message` 上下文 Error（cause 保留）、参数透传与 null 可选
  参数归一化
- **PluginBridge（宿主半边）测试（8 项，此前覆盖率 0%）**：ping 应答、
  sidebar/panel 注册的 pluginId 前缀语义、未知方法转发后端、后端拒绝时
  ok:false 错误回传、非桥接消息过滤、事件广播与主题事件重播
- **dshStore 动作与 dshService 纯函数测试（6 项）**：start/stop/restart
  状态机与错误透出、subscribeEvents 的 dsh.state → connect 迁移、
  指数退避序列、WebUI 地址构建、Tauri 环境探测
- **CoreManagerPanel / PluginList / UpdatePanel 测试（8 项）**：已装/远端
  版本展示与切换/删除/安装调用、插件列表启用开关与卸载、更新检查
  「已最新」Toast 与更新日志渲染（经 toastStore 断言）
- **ProfileManagerPage 测试（4 项）**：档案列表与「当前」徽标、
  按名称+端口创建、导出调用参数与删除确认链路、导入路径输入与刷新
- **lifecycle 集成测试扩展档案导入/导出**：真实文件导出、同名导入拒绝、
  改名导入后隔离目录重建、删除清理隔离目录与二次删除 NotFound
- **市场页详情视图测试（+2）**：README Markdown 渲染与返回市场、
  README 缺失时的占位文案
- **PluginHost 组件测试（5 项）**：iframe 协议 URL 与沙箱/桥标记、
  禁用态与后端错误详情、加载失败覆盖层重试、多实例桥标记唯一性
- **市场页社区搜索测试（+2）**：GitHub 搜索结果渲染（star/仓库名）、
  zipball 安装调用参数、无结果空态提示
- **loader.rs 白名单路径边界测试（+4）**：`~` 前缀展开、组件边界
  （`base` 与 `base-evil` 不混淆）、未解析路径的原样前缀匹配语义、
  Windows `\\?\` 扩展前缀剥离
- **OnboardingPage 向导流程测试（5 项）**：欢迎页环境徽章、推荐预设
  预选与切换、可选 CLI 注册按钮状态流转、完成步骤的档案创建/设置
  持久化/onDone 回调、汇总页文案
- **测试基建**：`tests/helpers/mockTauriService.ts` 共享 mock 工厂
  （显式导出列表 + 事件订阅 no-op 取消函数 + 后端契约空值兜底），
  mainPage/settingsPage/panels 三个测试文件重构复用
- **compare_versions 边界加固与测试**：容忍首尾空白与 v 前缀；
  用测试钉住已知局限（仅比较前 3 段、prerelease 截断判等）
- **SettingsPage 测试（4 项）**：加载态/版本号渲染、通用页主题切换保存、
  dsh 配置页端口修改持久化、高级页白名单内容展示
- **profile_service 纯逻辑提取**：`ensure_not_duplicate`（id/name 双重
  唯一性，create 与 import 共用）与 `retain_existing`（删除未命中显式
  NotFound）+ 单元测试（+2）
- **MainPage 集成测试（5 项）**：核心过期横幅显隐与版本文案、
  右侧插件面板坞显隐/标签/禁用插件宿主剔除
- **CliPanel / Sidebar 组件测试（6 项）**：CLI 注册状态流转、
  dsh 启动/停止/重启按钮随状态切换、状态元数据与错误块、档案切换
- **plugin_service 扫描测试（+3）**：合法/非法 manifest/非插件目录、
  缺失根目录容错、多根扫描的 builtin 标记
- **pluginStore / profileStore 状态单测补齐（12 项）**：桥接注册的
  pluginId 前缀语义、反注册清理 activeSidebarId、panel 去重、
  档案删除时活动档案回落、后端错误透出
- **market_service 仓库校验提取**：`normalize_repo` 纯函数
  （owner/repo 归一化、`.git` 剥离、路径穿越/多级/空白拒绝）+ serde
  可选字段缺省测试（3 项）
- **WebDriver e2e 场景骨架**（`src-tauri/tests/webdriver_e2e.rs`）：
  reqwest 直连 WebDriver 协议的最小客户端（会话/标题/元素定位，零新增
  依赖），场景 1「应用启动 → 主窗口就绪」；默认跳过，`DSH_E2E=1` +
  `DSH_E2E_APP` 按需启用，tests/e2e/README.md 更新运行说明
- **插件 SDK 事件能力增强**：`once`（一次性订阅）、`off`（显式反订阅）、
  `waitForEvent(method, timeoutMs?)`（等待下一次事件，超时 reject）；
  新增 `plugins/sdk/test/bridge-client.test.ts` 覆盖调用往返、错误/超时、
  订阅语义（8 项）
- **dsh 日志面板过滤**：级别过滤（all/error/warn/success）+ 关键字
  大小写不敏感搜索，`filterLogLines` 纯函数 + 组件交互测试（8 项）
- **插件生命周期服务层集成测试**（`src-tauri/tests/lifecycle.rs`，对齐
  e2e 场景 4/5）：临时 `DSH_HOME` 下走真实服务栈 —— 设置持久化、
  插件安装/禁用/启用/KV 存储隔离/卸载语义/非法 manifest 拒绝
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

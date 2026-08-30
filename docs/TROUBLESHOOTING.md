# 常见问题排查（TROUBLESHOOTING）

## 安装失败

### Windows：安装包无法运行 / 智能屏幕警告
- NSIS 安装包未签名会有 SmartScreen 提示：点击「仍要运行」。
- 报缺 WebView2：安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 自带）。
- 权限问题：安装模式为 perMachine（需要管理员）；或改用便携版直接解压运行。

### macOS：「已损坏，无法打开」
未公证的 DMG 会有 Gatekeeper 拦截：
```bash
sudo xattr -rd com.apple.quarantine /Applications/dsh-tauri-desktop.app
```

### Linux：AppImage 无法启动 / deb 依赖缺失
```bash
# AppImage 需要 FUSE
sudo apt-get install libfuse2
# deb 依赖（WebKitGTK 4.1）
sudo apt-get install libwebkit2gtk-4.1-0 libgtk-3-0
```

## 应用启动类

### 启动后一直显示加载画面
主窗口在 `app_ready` 后才显示。若前端崩溃：
- 开发模式：查看终端里 Vite/Rust 报错。
- 正式版：删除 `%USERPROFILE%\.dsh\settings.json`（或 `~/.dsh/settings.json`）
  排除设置损坏，然后重开应用。

### 窗口不见了（只剩托盘）
托盘左键点击显示主窗口；或托盘右键 → 显示主窗口。
若仍无窗口，删除 `~/.dsh/settings.json` 中窗口状态缓存后重启。

## dsh 启动失败

### 「未找到 Node.js (>=18)」
- 本地已装 Node：在设置 → dsh 配置中手动指定 Node 路径。
- 未安装：应用内引导会自动下载运行时；也可自行安装 Node ≥ 18 后重启应用。

### 「未找到已安装的 dsh 核心」
- 首次使用：在引导页/设置中执行 dsh 核心安装（从 GitHub Releases 下载发行版）。
- 已用 npm 安装过：`npm i -g @deepseek-ai/dsh` 后在设置里切换到「全局安装」入口，
  或直接使用 CLI shim（PATH 中的 dsh）。

### 端口被占用（健康检查超时）
- 日志显示 `dsh 服务已就绪` 前超时：检查端口占用
  `netstat -ano | findstr 3080`（Windows）/ `lsof -i :3080`（Unix）。
- 修改设置 → dsh 配置 → 端口，或让 dsh 使用其他档案端口。

### dsh 进程反复崩溃（自动重启上限）
- 查看主界面日志面板或 `~/.dsh/logs/dsh-*.log` 中最后几行 error。
- 常见原因：Node 版本过低（<18）、DSH_HOME 配置损坏（删除对应
  `~/.dsh/profiles/<档案>/` 后重建）、代理环境变量导致下载失败
  （`unset HTTP_PROXY HTTPS_PROXY` 后重试）。

## 插件类

### 插件加载失败（红色错误提示）
- manifest.json 字段非法（id 冲突 / version 非 semver / entry 缺失）——
  错误详情会显示具体原因。
- 插件目录含符号链接被拒绝加载（安全策略）。
- 修复后重启应用重新扫描。

### 插件调用报「缺少权限: xxx」
在 manifest.json 的 `permissions` 中补上对应权限（fs/exec/storage/git/network/ui/notification），
然后重装/重启插件。

### 插件 fs.write 报「路径不在白名单内」
设置 → 高级 → 插件安全白名单 → 文件系统白名单，添加允许目录
（`~` 表示用户目录）。默认仅 `~/.dsh/**` 可写。

### 插件 exec 报「命令不在允许列表中」
设置 → 高级 → 插件安全白名单 → 可执行命令，添加命令名（如 `python`）。
危险命令（`rm -rf /`、`shutdown`、`format` 等）始终被拒绝。

## 界面类

### Linux Wayland 黑屏 / 白屏
WebKitGTK 在部分 Wayland 合成器上存在问题：
```bash
# 方案 1：强制 XWayland
GDK_BACKEND=x11 dsh-tauri-desktop

# 方案 2：WebKitGTK 硬件加速问题
WEBKIT_DISABLE_COMPOSITING_MODE=1 dsh-tauri-desktop

# 方案 3：DMABUF 渲染器问题（常见于 NVIDIA）
WEBKIT_DISABLE_DMABUF_RENDERER=1 dsh-tauri-desktop
```

### iframe 显示 dsh 界面但样式异常
dsh Web UI 依赖自身资源，均从 dsh 服务加载；若使用了浏览器扩展类代理，
检查代理是否劫持了 `127.0.0.1:3080`（本地地址建议加入直连名单）。

## 自更新类

### 「检查更新失败」
- 网络需能访问 `api.github.com`；内网环境可设置代理（设置 → 高级）。
- 私有部署：用环境变量 `DSH_UPDATE_REPO=owner/repo` 指向自己的 Releases。

### 「更新包校验失败」
下载包 SHA256 与 latest.json 元数据不符（网络劫持或不完整下载），
更新包已自动丢弃。重试下载；持续失败请手动到 Releases 页面下载安装包。

## 重置一切

```bash
# 完全重置（删除所有配置/插件/档案数据；dsh 核心与运行时也一并删除）
rm -rf ~/.dsh        # Windows: rmdir /s /q %USERPROFILE%\.dsh
```

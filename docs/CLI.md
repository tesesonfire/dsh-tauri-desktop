# 命令行使用文档（CLI）

dsh-tauri-desktop 安装 CLI shim 后，可在任意终端直接使用 `dsh` 命令。
shim 的本质是：`node <dsh核心入口> <参数...>` —— 参数原样转发给 dsh 核心。

## 安装

- 应用内：设置 → dsh 配置 → 「命令行集成」→ 注册 dsh 命令
- shim 位置：
  - Windows：`~/.dsh/bin/dsh.cmd`（另有无扩展名 `dsh` 供 Git Bash 使用），并把该目录写入用户 PATH（注册表 `HKCU\Environment\Path`，**只追加不覆盖**）
  - macOS/Linux：`~/.local/bin/dsh`（755），并把 PATH 追加到 `~/.bashrc` / `~/.zshrc`
    （带 `# >>> dsh-tauri-desktop >>>` 标记块，幂等可重复执行）

> PATH 修改对新开的终端窗口生效。

## 命令

```text
dsh [全局参数] <子命令> [子命令参数]
```

### 全局参数

| 参数 | 说明 | 示例 |
|---|---|---|
| `--profile <name>` | 使用指定档案（隔离的 DSH_HOME） | `dsh --profile work web` |
| `--host <addr>` | Web UI 监听地址（默认 127.0.0.1） | `dsh web --host 0.0.0.0` |
| `--port <port>` | Web UI 端口（默认 3080） | `dsh web --port 4000` |
| `--version` | 显示版本 | `dsh --version` |
| `--help` | 显示帮助 | `dsh --help` |

### 常用子命令（转发 dsh 核心）

| 子命令 | 说明 |
|---|---|
| `web` | 启动 dsh Web UI（桌面端内嵌即此命令） |
| `chat` | 命令行对话 |
| 其他 | 以 dsh 核心实际支持的子命令为准（`dsh --help`） |

## 使用示例

```bash
# 默认配置启动（等价于桌面端点击「启动」）
dsh web

# 指定档案与端口
dsh --profile work web --port 3081

# 查看版本
dsh --version
```

## 语义说明

- **档案与 DSH_HOME**：`--profile work` 会把环境变量 `DSH_HOME` 指向
  `~/.dsh/profiles/work/`，实现配置/会话/插件完全隔离。桌面端创建的档案
  与 CLI 完全互通。
- **与桌面端的关系**：桌面端管理的 dsh 进程与 CLI 启动的进程互不感知，
  同时使用时请用不同 `--port`。
- **卸载**：删除 `~/.dsh/bin/dsh.cmd`（Windows）或 `~/.local/bin/dsh`
  （Unix），并移除 PATH 中的对应条目/标记块。
- **自定义 Node**：shim 固定调用 `node`；如需指定 Node，在设置 → dsh 配置
  中设置 Node 路径后重新注册 shim。

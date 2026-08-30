# dsh-tauri-worktree（Git 工作区插件）

为每个 dsh 会话创建隔离的 Git Worktree，支持检出本地分支、归档（lock，不删除磁盘内容）、恢复与删除。

## manifest

- id：`com.dsh-tauri.worktree`
- 权限：`ui`、`git`、`storage`
- 设置项：`repoPath`（仓库路径）、`worktreeRoot`（worktree 根目录，默认 `~/.dsh/worktrees`）

## 功能

| 操作 | git 命令 |
|---|---|
| 创建 | `git worktree add <path> -b dsh/<sessionId>` |
| 列表 | `git worktree list --porcelain` |
| 检出 | `git -C <path> checkout <branch>` |
| 归档 | `git worktree lock <path>`（状态 archived） |
| 恢复 | `git worktree unlock <path>` |
| 删除 | `git worktree remove <path>` + `git worktree prune` |

所有 git 子命令均经由宿主 `git.run` 白名单（worktree/branch/checkout 等）执行。

## 测试

`test/worktree.test.ts` 覆盖：分支名清洗、命令参数构建（含白名单断言）、
porcelain 输出解析、WorktreeRegistry 生命周期。

# dsh-tauri-rightclick（右键菜单插件）

为 dsh 界面的五类目标补充常用操作，支持动态注册：

| 作用域 | 默认菜单项 |
|---|---|
| session（会话） | 归档会话 / 复制标题 / 分隔线 |
| workspace（工作区） | 在 Worktree 中打开 |
| content（正文） | 复制所选 / 引用到输入框 |
| link（链接） | 复制链接 |
| input（输入框） | 粘贴为纯文本 |

- DOM 目标 → 作用域映射：`[data-dsh-session]` / `[data-dsh-workspace]` /
  `href` / `input|textarea|[contenteditable]` → 兜底 `content`
- 菜单项注册支持 `separator`（分隔线，允许空标题）
- 设置项：`enableCopyLink`、`enableArchive`（按插件隔离存储）

## manifest

- id：`com.dsh-tauri.rightclick`
- 权限：`ui`、`storage`

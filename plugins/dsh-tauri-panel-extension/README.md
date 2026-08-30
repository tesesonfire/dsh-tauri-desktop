# dsh-tauri-panel-extension（扩展管理插件）

Skills 与 MCP 服务器管理：

- **Skills**：指令型扩展，`spec` 保存技能内容；支持从 GitHub 仓库导入（`owner/repo` 简写或完整 URL，经 `git.run` clone）
- **MCP**：服务器型扩展，`spec` 保存启动命令
- 启用/禁用/删除、按类型与状态筛选、storage 持久化

## manifest

- id：`com.dsh-tauri.panel-extension`
- 权限：`ui`、`storage`、`network`、`fs`
- contributes：侧边栏 `extensions`、面板 `skills` 与 `mcp`、命令 `import-repo`

## 测试

`test/extensions.test.ts` 覆盖：id 校验、仓库注册表生命周期、JSON 序列化回放、
仓库地址归一化、导入命令构建。

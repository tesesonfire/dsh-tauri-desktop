# 贡献指南（CONTRIBUTING）

感谢关注 dsh-tauri-desktop！请先阅读 [DEVELOPMENT.md](docs/DEVELOPMENT.md) 搭建环境。

## 开发流程

1. Fork 仓库并创建特性分支：`git checkout -b feat/my-feature`
2. 开发 + 补充测试（见下方「测试要求」）
3. 本地全量验证：
   ```bash
   pnpm lint && pnpm build && pnpm test
   cd src-tauri && cargo clippy -- -D warnings && cargo test
   ```
4. 提交 PR 到 `main` 分支，CI 三平台通过后由维护者 Review 合并

## Commit 规范（Conventional Commits）

```
<type>(<scope>?): <summary>

<body?>
```

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `refactor` | 重构（不改行为） |
| `test` | 测试 |
| `chore` | 构建/工具/依赖 |
| `perf` | 性能优化 |
| `ci` | CI/CD 配置 |

示例：

```
feat(workflow): dsh 崩溃自动重启支持退避上限
fix(plugin-api): fs 白名单在 Windows 下未归一化 \\?\ 前缀
docs: 补充 CLI.md 档案语义说明
```

## 代码规范

- **TypeScript**：严格模式（`strict`、`noImplicitAny`），禁止 `any`，
  所有函数显式返回类型；组件 Props 必须定义接口
- **Rust**：禁止滥用 `unwrap/expect`（仅测试中允许），使用 `?` + `AppError`；
  公共项必须有 Rustdoc；关键路径打 `tracing` 日志
- **注释**：公共 API 必须有 JSDoc/Rustdoc；只在代码无法自解释处写行内注释
- **命名**：TS camelCase/PascalCase；Rust snake_case/PascalCase
- **错误处理**：前端异步操作 try-catch + Toast；Rust 服务错误统一映射 `AppError`

## 测试要求

| 改动 | 要求 |
|---|---|
| Rust services/models/plugins | 对应模块 `#[cfg(test)]` 单元测试 |
| 前端 stores/services/hooks 纯逻辑 | `tests/unit/` Vitest 测试 |
| 内置插件 | `plugins/<id>/test/` Vitest 测试 |
| UI 组件 | 渲染/交互行为测试（可选，鼓励） |

覆盖率目标：Rust 核心逻辑 ≥ 80%。报告：`pnpm test:coverage`。

## 新增内置插件

1. `plugins/<name>/` 下创建 `package.json`、`manifest.json`（符合
   [PLUGIN_API.md](docs/PLUGIN_API.md) 规范）、`tsconfig.json`、`index.html`
2. `src/index.ts` 入口 + `src/<logic>.ts` 纯逻辑 + `test/` 测试 + `README.md`
3. 使用 `plugins/sdk/bridge-client.ts` SDK，不得绕过桥接直接访问宿主
4. 更新根 `README.md` 内置插件清单

## 安全问题

请勿公开提交安全漏洞。发送邮件至维护者（见仓库主页），确认后统一披露。

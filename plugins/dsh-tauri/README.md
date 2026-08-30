# dsh-tauri（核心通信插件）

随 dsh-tauri-desktop 安装包内置。为其他插件提供与 Tauri Rust 后端通信的标准通道：

- `invoke`/`event` 封装：所有桥接方法（fs/exec/storage/git/http/ui）的统一入口
- 调用追踪：最近调用记录、成功率、平均耗时
- 探活：`ping` 宿主并报告宿主版本

## manifest

- id：`com.dsh-tauri.core`
- 权限：`ui`、`storage`
- contributes：侧边栏入口 `bridge`、面板 `bridge-status`、命令 `ping`、设置项 `logInvocations`

## 开发

```bash
pnpm --dir plugins/dsh-tauri build    # esbuild 打包到 dist/index.js
pnpm --dir plugins/dsh-tauri test     # Vitest 单元测试
```

## API

其他插件不直接依赖本包，而是复用 `plugins/sdk/bridge-client.ts` 提供的 `BridgeClient`
（与本插件同源协议，见 docs/PLUGIN_API.md）。本插件承担：

1. 桥接健康监控（成功率/延迟可视化）；
2. 首个验证 postMessage 协议连通性的冒烟插件。

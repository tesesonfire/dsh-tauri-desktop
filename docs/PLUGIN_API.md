# 插件开发文档（PLUGIN_API）

dsh-tauri-desktop 插件 = 一个包含 `manifest.json` 的目录 + iframe UI。
插件在独立 iframe 中运行，通过 `postMessage` 与宿主通信，Rust 端执行权限校验。

## 1. manifest 规范

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✅ | 反向域名，全局唯一，仅允许 `[a-zA-Z0-9._-]` |
| `name` | string | ✅ | 展示名 |
| `version` | string | ✅ | semver（x.y.z） |
| `description` | string | – | 一句话描述（市场展示） |
| `author` | string | – | 作者 |
| `entry` | string | ✅ | 入口 HTML（相对插件根目录，禁止 `..`） |
| `permissions` | Permission[] | – | 权限申请（见下表） |
| `contributes` | object | – | UI 扩展点（见下节） |

**权限**（`permissions`，未申请则对应 API 调用被拒绝）：

| 权限 | 允许的 API | 安全约束 |
|---|---|---|
| `fs` | `fs.read` / `fs.write` | 路径必须在白名单目录内（默认 `~/.dsh/**` + 设置扩展） |
| `exec` | `exec.run` | 命令必须在允许列表（默认 git/node/npm/pnpm/npx），拒绝危险参数 |
| `storage` | `storage.get/set/delete` | 按插件 id 隔离命名空间 |
| `git` | `git.run` | 白名单子命令（status/diff/log/branch/worktree/clone/checkout/add/commit/fetch/pull/push） |
| `network` | `http.request` | 一律经 Rust 端代理，仅 http/https |
| `ui` | `ui.registerSidebar/Panel/ContextMenu`、`tauri.invoke` | UI 注册与白名单命令 |
| `notification` | `ui.showNotification` | 系统通知 |

**contributes**（声明式 UI 扩展点）：

```jsonc
{
  "sidebar": [{ "id": "main", "title": "MyPlugin", "icon": "puzzle" }],
  "panel":   [{ "id": "view", "title": "View" }],
  "command": [{ "id": "do-it", "title": "Do It" }],
  "setting": [{ "key": "limit", "type": "number", "default": 10, "options": [] }],
  "theme":   { "cssVariables": { "--accent": "#4f8cff" } }
}
```

`icon` 可选内置图标名：files / search / puzzle / settings / bell / terminal / panel / store / git / menu / archive / download 等。

## 2. 插件生命周期

```
discover → install → verify(manifest/权限/无符号链接)
  → load(iframe 创建) → activate(ready/register)
  → 运行(req/res 桥接) → deactivate → uninstall → cleanup
```

- **discover/install**：Rust 扫描内置目录与应用资源、`~/.dsh/plugins/`；
  `plugin_install(path)` 复制目录并校验 manifest
- **load/activate**：前端 PluginHost 用 `dshplugin://<id>/<entry>` 创建 iframe；
  插件加载 SDK 后 `registerSidebar/registerPanel` 声明 UI
- **deactivate/uninstall**：禁用即拒绝全部桥接调用；卸载清理目录与存储

## 3. postMessage 协议

**请求（插件 → 宿主）：**

```ts
{
  id: "req-1-<uuid>",     // 唯一 id，响应回传同 id
  pluginId: "com.example.demo",
  type: "req",
  method: "storage.set",
  payload: { key: "k", value: "v" }
}
```

**响应（宿主 → 插件）：**

```ts
{ id: "req-1-<uuid>", pluginId: "com.example.demo", type: "res", ok: true, payload: {...} }
{ id: "req-1-<uuid>", pluginId: "com.example.demo", type: "res", ok: false, error: "缺少权限: storage" }
```

**事件广播（宿主 → 插件）：**

```ts
{ id: "evt:<uuid>", pluginId: "*", type: "evt", method: "theme.changed", payload: "dark" }
```

内置事件：`theme.changed`（"light"|"dark"）、`dsh.state`（DshStatus）、`panel.message`（面板间消息）。

## 4. API 参考（SDK）

使用 `plugins/sdk/bridge-client.ts`（esbuild 一起打包进插件）：

```ts
import { createClient } from "../../sdk/bridge-client";

const client = createClient({ pluginId: "com.example.demo" });
client.listen(); // 监听响应/事件（iframe 内调用）

/* storage（隔离 KV） */
await client.storageGet("key");            // string | null
await client.storageSet("key", "value");
await client.storageDelete("key");         // boolean

/* fs（白名单内） */
await client.fsRead("~/.dsh/settings.json");   // { content }
await client.fsWrite("~/.dsh/x.txt", "hi");    // { ok }

/* exec（允许列表内） */
await client.exec("git", ["status"]);      // { code, stdout, stderr }

/* git（白名单子命令） */
await client.git(["worktree", "list", "--porcelain"], "D:/repo");

/* http（后端代理） */
await client.httpRequest("https://api.github.com/zen"); // { status, body }

/* ui */
await client.registerSidebar({ id: "main", title: "MyPlugin", icon: "puzzle" });
await client.registerPanel({ id: "view", title: "View" });
await client.registerContextMenu({ scope: "session", id: "m1", title: "归档", command: "session.archive" });
await client.showNotification("标题", "内容");

/* 事件 */
client.on("theme.changed", (theme) => { ... });   // 订阅，返回取消函数
client.on("dsh.state", (status) => { ... });
client.once("dsh.state", handler);                // 一次性订阅（触发后自动移除）
client.off("theme.changed", handler);             // 显式反订阅
const next = await client.waitForEvent("dsh.state", 5000); // 等待下一次事件，超时 reject
```

各方法返回值错误时 Promise reject（`error` 字符串包装为 Error）。
SDK 行为由 `plugins/sdk/test/bridge-client.test.ts` 单元测试覆盖。

## 5. 最小示例插件

目录结构：

```
plugins/com.example.hello/
├── manifest.json
├── index.html
├── src/index.ts
└── dist/index.js   (esbuild 产物)
```

`manifest.json`：

```json
{
  "id": "com.example.hello",
  "name": "Hello",
  "version": "0.1.0",
  "entry": "index.html",
  "permissions": ["ui", "storage"],
  "contributes": { "sidebar": [{ "id": "main", "title": "Hello", "icon": "puzzle" }] }
}
```

`src/index.ts`：

```ts
import { createClient } from "../../sdk/bridge-client";

const client = createClient({ pluginId: "com.example.hello" });
client.listen();

const count = Number((await client.storageGet("count")) ?? 0) + 1;
await client.storageSet("count", String(count));

document.body.innerHTML = `<h1>Hello! 打开次数：${count}</h1>`;
```

`index.html`：

```html
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body><div id="app">loading…</div><script src="./dist/index.js"></script></body></html>
```

构建：`esbuild src/index.ts --bundle --format=iife --outfile=dist/index.js`

安装：把目录放入 `~/.dsh/plugins/`，或在设置 → 插件中查看。重启应用后侧边栏出现「Hello」图标。

## 6. 内置插件源码索引

| 插件 | 目录 | 核心逻辑（含测试） |
|---|---|---|
| dsh-tauri | `plugins/dsh-tauri` | `src/bridge.ts` 调用追踪/探活 |
| dsh-tauri-ui | `plugins/dsh-tauri-ui` | `src/theme.ts` 主题解析/CSS 变量 |
| dsh-tauri-worktree | `plugins/dsh-tauri-worktree` | `src/worktree.ts` 命令构建/porcelain 解析 |
| dsh-tauri-panel | `plugins/dsh-tauri-panel` | `src/protocol.ts` 面板注册/消息路由 |
| dsh-tauri-panel-extension | `plugins/dsh-tauri-panel-extension` | `src/extensions.ts` Skills/MCP 注册表 |
| dsh-tauri-session | `plugins/dsh-tauri-session` | `src/archive.ts` 归档查询/分组 |
| dsh-tauri-rightclick | `plugins/dsh-tauri-rightclick` | `src/menus.ts` 菜单注册表/作用域映射 |
| dsh-tauri-notification | `plugins/dsh-tauri-notification` | `src/notification.ts` 状态迁移规则/开关归一化 |

## 7. 插件市场

市场功能对齐官方生态（数据源与安装模型参照
[dsh-tauri-desk/dsh-tauri-plugins](https://github.com/dsh-tauri-desk/dsh-tauri-plugins)
与参考实现 deepseek-harness-desktop）：

- **官方注册表**：`market_official` 返回 `MarketRegistry`。加载顺序为
  环境变量 `DSH_MARKET_REGISTRY_URL` → 默认远程
  `raw.githubusercontent.com/dsh-tauri-desk/dsh-tauri-plugins/main/marketplace.json`
  → 编译期内置快照 `src-tauri/resources/marketplace.json`（离线可用）。
- **社区搜索**：`market_search {query}` 走 GitHub Search API（`dsh` 关键词增强、
  按 star 排序、前 10 条）。
- **安装 / 升级**：`market_install {repo, subpath?}` 下载仓库默认分支 zipball
  （`api.github.com/repos/<owner>/<repo>/zipball`，自动跟随 main/master）→
  解压（zip-slip 防御）→ 定位含 `manifest.json` 的插件目录（显式 subpath 优先，
  否则浅层扫描取最浅命中，跳过 `.git/node_modules/dist/target`）→
  manifest 校验 → 覆盖安装到 `~/.dsh/plugins/<id>`（升级即重装，KV 存储保留）。
- **升级检测**：`market_upgrades` 以 semver 对比本地已装版本与注册表版本，
  市场页在官方条目上直接给出「升级到 vX.Y.Z」入口。
- **安全边界**：与手动安装一致 —— 仅复制静态资源，桥接调用仍按 manifest
  权限白名单放行；仓库标识非法（路径穿越 / 多斜杠）直接拒绝。

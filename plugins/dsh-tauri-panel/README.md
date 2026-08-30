# dsh-tauri-panel（面板协议插件）

侧栏外壳与面板协议的核心实现：

- `registerPanel(pluginId, panelId, title)`：面板注册（重复注册视为更新标题）
- `activatePanel(pluginId, panelId)`：面板切换（激活面板被移除时自动回退）
- `panelMessage(from, to | null, payload)`：面板间通信（定向 / 广播，广播不含发送者）
- `inbox()`：激活面板时回放送达的消息

## manifest

- id：`com.dsh-tauri.panel`
- 权限：`ui`、`storage`
- contributes：侧边栏 `panels`、面板 `panel-manager`

## 协议

面板 key 约定为 `<pluginId>::<panelId>`；其他插件通过 SDK 的
`registerPanel` / `sendPanelMessage` 参与协议，本插件负责维护注册表与路由。

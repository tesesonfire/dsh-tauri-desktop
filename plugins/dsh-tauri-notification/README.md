# dsh-tauri-notification

dsh 状态变化桌面通知插件（内置第 8 个插件，对应预设 "DSH Notification"）。

## 功能

- 监听宿主 `dsh.state` 事件，在 **就绪 / 崩溃 / 启动失败 / 手动停止** 时发送系统通知
- 三类事件可独立开关（写入按插件隔离的存储，重启保留）
- 「发送测试通知」按钮用于验证系统通知权限
- 面板内展示最近 30 条事件日志（含是否触发通知）

## 诚实说明

- 通知依赖宿主 `ui.showNotification` 桥方法（后端 tauri-plugin-notification），
  系统层面未授权通知时调用会失败，插件只记录日志不会崩溃。
- "回合完成"粒度的事件目前宿主不提供（dsh WebUI 未暴露该信号），
  因此以 dsh 进程状态迁移为准；未来宿主补充事件后本插件无需改动即可接收
  （桥采用通用 `client.on(event, handler)` 分发）。

## 权限

- `ui`：侧边栏入口、面板渲染
- `notification`：系统通知
- `storage`：保存通知开关

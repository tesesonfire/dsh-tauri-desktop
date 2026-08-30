import { createClient } from "../../sdk/bridge-client";
import { applyCssVariables, mergeCssVariables, ThemeManager } from "./theme";

const PLUGIN_DEFAULTS: Record<string, string> = {
  "--brand-accent": "#4d6bfe",
  "--brand-success": "#22c55e",
  "--brand-warning": "#f59e0b",
  "--brand-danger": "#ef4444",
};

const manager = new ThemeManager();
const client = createClient({ pluginId: "com.dsh-tauri.ui" });

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">外观</h3>
    <p style="font-size:12px;opacity:.7">主题由主窗口统一管理，此处展示品牌色变量。</p>
    <div style="display:flex;gap:8px;margin-top:8px">
      <span title="--brand-accent" style="width:24px;height:24px;border-radius:6px;background:var(--brand-accent,#4d6bfe)"></span>
      <span title="--brand-success" style="width:24px;height:24px;border-radius:6px;background:var(--brand-success,#22c55e)"></span>
      <span title="--brand-warning" style="width:24px;height:24px;border-radius:6px;background:var(--brand-warning,#f59e0b)"></span>
      <span title="--brand-danger" style="width:24px;height:24px;border-radius:6px;background:var(--brand-danger,#ef4444)"></span>
    </div>
  `;
}

void (async () => {
  client.listen();
  // 宿主主题变化 → 更新本地渲染
  client.on("theme.changed", (payload) => {
    manager.onSystemChange(payload === "dark");
    render();
  });
  // 用户覆盖色（按插件隔离存储）
  const overridesRaw = await client.storageGet("accentColor").catch(() => null);
  const variables = mergeCssVariables(PLUGIN_DEFAULTS, {
    "--brand-accent": overridesRaw ?? "#4d6bfe",
  });
  applyCssVariables(document.documentElement, variables);
  render();
})();

import { createClient } from "../../sdk/bridge-client";
import { PanelRegistry } from "./protocol";

const client = createClient({ pluginId: "com.dsh-tauri.panel" });
const registry = new PanelRegistry();

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  const active = registry.active;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">面板管理</h3>
    <p style="font-size:12px;opacity:.7">当前激活：${active ? active.title : "无"}</p>
    <ul style="list-style:none;padding:0;margin:0;font-size:13px">
      ${registry
        .list()
        .map(
          (panel) => `
        <li style="display:flex;justify-content:space-between;padding:4px 0">
          <span>${panel.title}<span style="opacity:.5"> · ${panel.pluginId}</span></span>
          <button data-activate="${panel.pluginId}::${panel.panelId}">激活</button>
        </li>`,
        )
        .join("")}
    </ul>
  `;
  app.querySelectorAll("button[data-activate]").forEach((button) => {
    button.addEventListener("click", () => {
      const [pluginId = "", panelId = ""] = ((button as HTMLElement).dataset.activate ?? "").split("::");
      registry.activate(pluginId, panelId);
      render();
    });
  });
}

void (async () => {
  client.listen();
  client.registerPanel({ id: "panel-manager", title: "面板管理" });
  // 收集其他插件的面板注册（宿主 ui.registerPanel 均会同步到本插件视图）
  client.on("panel.message", () => render());
  render();
})();

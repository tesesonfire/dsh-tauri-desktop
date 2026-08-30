import { createClient } from "../../sdk/bridge-client";
import { ContextMenuRegistry, defaultMenuItems } from "./menus";

const client = createClient({ pluginId: "com.dsh-tauri.rightclick" });
const registry = new ContextMenuRegistry();

/** 注册默认菜单并同步到宿主 */
function setupDefaults(): void {
  for (const item of defaultMenuItems()) {
    registry.register(item);
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">右键菜单</h3>
    <p style="font-size:12px;opacity:.7">已注册 ${registry.all().length} 个菜单项（5 个作用域）。</p>
    <ul style="list-style:none;padding:0;margin:0;font-size:13px">
      ${registry
        .all()
        .map(
          (item) => `
        <li style="display:flex;justify-content:space-between;padding:4px 0">
          <span>${item.separator ? "──────" : item.title}<span style="opacity:.5"> · ${item.scope}</span></span>
          <button data-remove="${item.id}" ${item.separator ? "disabled" : ""}>移除</button>
        </li>`,
        )
        .join("")}
    </ul>
  `;
  app.querySelectorAll("button[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      registry.unregister((button as HTMLElement).dataset.remove ?? "");
      render();
    });
  });
}

void (async () => {
  client.listen();
  setupDefaults();
  // 向宿主声明各作用域的菜单能力
  for (const scope of ["session", "workspace", "content", "link", "input"] as const) {
    await client
      .registerContextMenu({ scope, id: `scope-${scope}`, title: `dsh 右键菜单` })
      .catch(() => undefined);
  }
  render();
})();

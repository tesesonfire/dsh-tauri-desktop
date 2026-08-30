import { createClient } from "../../sdk/bridge-client";
import { ExtensionRegistry, normalizeRepoRef } from "./extensions";

const client = createClient({ pluginId: "com.dsh-tauri.panel-extension" });
const registry = new ExtensionRegistry();

const STORAGE_KEY = "extensions";

async function persist(): Promise<void> {
  await client.storageSet(STORAGE_KEY, JSON.stringify(registry.toJSON()));
}

async function load(): Promise<void> {
  const raw = await client.storageGet(STORAGE_KEY).catch(() => null);
  if (raw !== null) {
    try {
      registry.load(JSON.parse(raw));
    } catch {
      // 存储损坏时从空开始
    }
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  const row = (entry: { id: string; name: string; kind: string; status: string }): string => `
    <li style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">
      <span>${entry.name}<span style="opacity:.5"> · ${entry.kind} · ${entry.status}</span></span>
      <span>
        <button data-toggle="${entry.id}">${entry.status === "enabled" ? "禁用" : "启用"}</button>
        <button data-remove="${entry.id}">删除</button>
      </span>
    </li>`;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">扩展（Skills / MCP）</h3>
    <div style="display:flex;gap:4px;margin-bottom:6px">
      <input id="repo" placeholder="owner/repo 或 https://…" style="flex:1" />
      <button id="import">导入技能仓库</button>
    </div>
    <ul style="list-style:none;padding:0;margin:0">
      ${registry.list().map(row).join("")}
    </ul>
  `;
  app.querySelectorAll("button[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = (button as HTMLElement).dataset.toggle ?? "";
      const entry = registry.get(id);
      if (entry === null) return;
      registry.setEnabled(id, entry.status !== "enabled");
      void persist().then(render);
    });
  });
  app.querySelectorAll("button[data-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      registry.remove((button as HTMLElement).dataset.remove ?? "");
      void persist().then(render);
    });
  });
  document.getElementById("import")?.addEventListener("click", () => {
    const input = document.getElementById("repo") as HTMLInputElement | null;
    if (input === null || input.value.trim() === "") return;
    const url = normalizeRepoRef(input.value);
    void client
      .git(["clone", url, `~/.dsh/extensions/${url.split("/").pop()}`])
      .then(() => client.showNotification("扩展导入完成", url))
      .catch(() => undefined);
  });
}

void (async () => {
  client.listen();
  await load();
  render();
})();

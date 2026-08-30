import { createClient } from "../../sdk/bridge-client";
import {
  groupArchive,
  listProjects,
  queryArchive,
  SessionArchive,
  type GroupKey,
  type SortKey,
} from "./archive";

const client = createClient({ pluginId: "com.dsh-tauri.session" });
const archive = new SessionArchive();

const STORAGE_KEY = "archive";

async function persist(): Promise<void> {
  await client.storageSet(STORAGE_KEY, JSON.stringify(archive.list()));
}

async function load(): Promise<void> {
  const raw = await client.storageGet(STORAGE_KEY).catch(() => null);
  if (raw !== null) {
    try {
      for (const session of JSON.parse(raw) as Parameters<SessionArchive["archive"]>[0][]) {
        archive.archive(session);
      }
    } catch {
      // 损坏数据忽略
    }
  }
}

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  const all = archive.list();
  const project = (document.getElementById("filter-project") as HTMLSelectElement | null)?.value ?? "";
  const search = (document.getElementById("search") as HTMLInputElement | null)?.value ?? "";
  const groupKey = ((document.getElementById("group") as HTMLSelectElement | null)?.value ?? "none") as GroupKey;
  const sortKey = ((document.getElementById("sort") as HTMLSelectElement | null)?.value ?? "archivedAt") as SortKey;

  const filtered = queryArchive(all, {
    search,
    project: project === "" ? undefined : project,
    sortKey,
    sortOrder: "desc",
  });
  const groups = groupArchive(filtered, groupKey);

  app.innerHTML = `
    <h3 style="margin:0 0 8px">归档聊天</h3>
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;font-size:12px">
      <input id="search" placeholder="搜索标题…" value="${search}" style="flex:1;min-width:100px" />
      <select id="filter-project">
        <option value="">全部项目</option>
        ${listProjects(all).map((p) => `<option ${p === project ? "selected" : ""}>${p}</option>`).join("")}
      </select>
      <select id="sort">
        <option value="archivedAt" ${sortKey === "archivedAt" ? "selected" : ""}>按归档时间</option>
        <option value="title" ${sortKey === "title" ? "selected" : ""}>按标题</option>
        <option value="messageCount" ${sortKey === "messageCount" ? "selected" : ""}>按消息数</option>
      </select>
      <select id="group">
        <option value="none" ${groupKey === "none" ? "selected" : ""}>不分组</option>
        <option value="project" ${groupKey === "project" ? "selected" : ""}>按项目</option>
        <option value="day" ${groupKey === "day" ? "selected" : ""}>按日期</option>
      </select>
    </div>
    ${Array.from(groups.entries())
      .map(
        ([group, sessions]) => `
      <div style="margin-top:6px;font-size:11px;opacity:.6">${group}</div>
      <ul style="list-style:none;padding:0;margin:0">
        ${sessions
          .map(
            (session) => `
          <li style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px">
            <span>${session.title}<span style="opacity:.5"> · ${session.messageCount} 条</span></span>
            <span>
              <button data-unarchive="${session.id}">取消归档</button>
              <button data-purge="${session.id}">永久删除</button>
            </span>
          </li>`,
          )
          .join("")}
      </ul>`,
      )
      .join("")}
    ${filtered.length === 0 ? '<p style="font-size:12px;opacity:.6">暂无归档会话。</p>' : ""}
  `;

  const rerender = (): void => render();
  ["search", "filter-project", "sort", "group"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", rerender);
    document.getElementById(id)?.addEventListener("change", rerender);
  });
  app.querySelectorAll("button[data-unarchive]").forEach((button) => {
    button.addEventListener("click", () => {
      archive.unarchive((button as HTMLElement).dataset.unarchive ?? "");
      void persist().then(render);
    });
  });
  app.querySelectorAll("button[data-purge]").forEach((button) => {
    button.addEventListener("click", () => {
      archive.purge((button as HTMLElement).dataset.purge ?? "");
      void persist().then(render);
    });
  });
}

void (async () => {
  client.listen();
  await load();
  render();
})();

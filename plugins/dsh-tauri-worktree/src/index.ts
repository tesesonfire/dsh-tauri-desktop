import { createClient } from "../../sdk/bridge-client";
import { parseWorktreeList, WorktreeCommands, WorktreeRegistry } from "./worktree";

const client = createClient({ pluginId: "com.dsh-tauri.worktree" });
const registry = new WorktreeRegistry();

interface WorktreeConfig {
  repoPath?: string;
  worktreeRoot?: string;
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const result = await client.git(args, cwd);
  if (result.code !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} 失败`);
  }
  return result.stdout;
}

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  const active = registry.list("active");
  const archived = registry.list("archived");
  const row = (sessionId: string, branch: string, archivedItem: boolean): string => `
    <div class="row"><span>${branch}</span>
      <span>
        <button data-act="checkout" data-sid="${sessionId}">检出</button>
        ${archivedItem
          ? `<button data-act="restore" data-sid="${sessionId}">恢复</button>`
          : `<button data-act="archive" data-sid="${sessionId}">归档</button>`}
      </span>
    </div>`;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">Git Worktree</h3>
    <div style="font-size:12px;opacity:.7">活跃 ${active.length} · 归档 ${archived.length}</div>
    <div>${active.map((e) => row(e.sessionId, e.branch, false)).join("")}</div>
    <div style="margin-top:8px;font-size:12px;opacity:.7">已归档</div>
    <div>${archived.map((e) => row(e.sessionId, e.branch, true)).join("")}</div>
    <button id="new-wt">为新会话创建</button>
  `;
  app.querySelectorAll("button[data-act]").forEach((button) => {
    button.addEventListener("click", () => {
      const sessionId = (button as HTMLElement).dataset.sid ?? "";
      const act = (button as HTMLElement).dataset.act ?? "";
      const entry = registry.get(sessionId);
      if (entry === null) return;
      if (act === "archive") {
        void runGit(WorktreeCommands.lock(entry.path)).then(() => {
          registry.archive(sessionId);
          render();
        });
      } else if (act === "restore") {
        void runGit(WorktreeCommands.unlock(entry.path)).then(() => {
          registry.restore(sessionId);
          render();
        });
      } else if (act === "checkout") {
        void runGit(WorktreeCommands.checkout(entry.path, entry.branch));
      }
    });
  });
  document.getElementById("new-wt")?.addEventListener("click", () => {
    const sessionId = `session-${Date.now()}`;
    const root = "~/.dsh/worktrees";
    const path = `${root}/${sessionId}`;
    const entry = registry.create(sessionId, path);
    void runGit(WorktreeCommands.add(entry.path, entry.branch))
      .then(() => render())
      .catch(() => undefined);
  });
}

void (async () => {
  client.listen();
  const config = (await client.storageGet("config").catch(() => null)) as string | null;
  const parsed: WorktreeConfig = config !== null ? JSON.parse(config) : {};
  if (parsed.repoPath !== undefined && parsed.repoPath !== "") {
    const output = await runGit(WorktreeCommands.list(), parsed.repoPath).catch(() => "");
    if (output !== "") {
      for (const item of parseWorktreeList(output)) {
        const sessionId = item.path.split(/[\\/]/).pop() ?? item.path;
        if (registry.get(sessionId) === null) {
          registry.create(sessionId, item.path);
        }
      }
    }
  }
  render();
})();

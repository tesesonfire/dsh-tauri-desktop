import { createClient } from "../../sdk/bridge-client";
import {
  decide,
  formatLogLine,
  normalizeSettings,
  type DshState,
  type NotificationSettings,
} from "./notification";

const client = createClient({ pluginId: "com.dsh-tauri.notification" });

let settings: NotificationSettings = { notifyOnReady: true, notifyOnCrash: true, notifyOnStop: false };
let prevState: DshState | null = null;
const logLines: string[] = [];

function pushLog(state: DshState, notified: boolean): void {
  logLines.unshift(formatLogLine(state, notified, Date.now()));
  if (logLines.length > 30) logLines.length = 30;
}

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  app.innerHTML = `
    <h3 style="margin:0 0 8px">通知</h3>
    <label style="display:flex;gap:6px;align-items:center;font-size:13px">
      <input type="checkbox" id="opt-ready" ${settings.notifyOnReady ? "checked" : ""}/> dsh 就绪时通知
    </label>
    <label style="display:flex;gap:6px;align-items:center;font-size:13px">
      <input type="checkbox" id="opt-crash" ${settings.notifyOnCrash ? "checked" : ""}/> 崩溃/失败时通知
    </label>
    <label style="display:flex;gap:6px;align-items:center;font-size:13px">
      <input type="checkbox" id="opt-stop" ${settings.notifyOnStop ? "checked" : ""}/> 手动停止时通知
    </label>
    <button id="btn-test" style="margin-top:8px;padding:4px 10px">发送测试通知</button>
    <div id="log" style="margin-top:10px;font-size:12px;opacity:.75;white-space:pre-line">${logLines.join("\n")}</div>
  `;
  const bind = (id: string, key: keyof NotificationSettings): void => {
    document.getElementById(id)?.addEventListener("change", (event) => {
      const checked = (event.target as HTMLInputElement).checked;
      settings = { ...settings, [key]: checked };
      void client.storageSet("settings", JSON.stringify(settings));
    });
  };
  bind("opt-ready", "notifyOnReady");
  bind("opt-crash", "notifyOnCrash");
  bind("opt-stop", "notifyOnStop");
  document.getElementById("btn-test")?.addEventListener("click", () => {
    void client
      .showNotification("dsh-tauri-desktop", "这是一条测试通知（来自 dsh-notification 插件）")
      .then(() => {
        logLines.unshift("测试通知已发送");
        render();
      });
  });
}

void (async () => {
  client.listen();
  settings = normalizeSettings(await client.storageGet("settings").catch(() => null));
  render();
  // 宿主 dsh 状态事件 → 规则判定 → 系统通知
  client.on("dsh.state", (payload) => {
    const state = (typeof payload === "string" ? payload : (payload as { state?: string })?.state) as DshState | undefined;
    if (state === undefined) return;
    const decision = decide(prevState, state, settings);
    prevState = state;
    pushLog(state, decision.notify);
    if (decision.notify) {
      void client.showNotification(decision.title, decision.body).catch(() => undefined);
    }
    render();
  });
  render();
})();

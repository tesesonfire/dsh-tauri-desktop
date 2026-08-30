import { createClient } from "../../sdk/bridge-client";
import { BridgeStatusModel, invokeWithTracking, pingHost } from "./bridge";

const client = createClient({ pluginId: "com.dsh-tauri.core" });
const model = new BridgeStatusModel();

function render(): void {
  const app = document.getElementById("app");
  if (app === null) return;
  const rate = model.successRate();
  const avg = model.averageDuration();
  app.innerHTML = `
    <h3 style="margin:0 0 8px">通信桥</h3>
    <div class="row"><span>状态</span><span class="ok">已连接</span></div>
    <div class="row"><span>最近调用</span><span>${model.recent(5).length}</span></div>
    <div class="row"><span>成功率</span><span>${rate === null ? "-" : `${Math.round(rate * 100)}%`}</span></div>
    <div class="row"><span>平均耗时</span><span>${avg === null ? "-" : `${Math.round(avg)}ms`}</span></div>
    <button id="ping">Ping 宿主</button>
    <div id="ping-result"></div>
  `;
  document.getElementById("ping")?.addEventListener("click", () => {
    void pingHost(client).then((health) => {
      const target = document.getElementById("ping-result");
      if (target === null) return;
      target.innerHTML = health.hostReachable
        ? `<p class="ok">宿主版本: ${health.version}</p>`
        : `<p class="bad">不可达: ${health.lastError}</p>`;
    });
  });
}

void (async () => {
  client.listen();
  await invokeWithTracking(client, "ping", undefined, model).catch(() => undefined);
  render();
})();

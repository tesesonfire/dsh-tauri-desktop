import type { BridgeMessage, BridgeMethod } from "@/types/plugin";
import { isBridgeRequest, newBridgeId } from "@/services/pluginApi";
import { appVersion, pluginBridgeCall, onDshState } from "@/services/tauriService";
import type { DshStatus } from "@/types/dsh";
import { usePluginStore } from "@/stores/pluginStore";
import { useThemeStore } from "@/stores/themeStore";

/**
 * postMessage 桥接（宿主侧）：
 * - 监听插件 iframe 的 req 消息 → 权限校验在 Rust 端 plugin_bridge_call 完成 → 回传 res
 * - 向插件广播 evt 事件（主题变化 / dsh 状态变化 / 面板消息）
 *
 * 协议见 docs/ARCHITECTURE.md §6。
 */
export class PluginBridge {
  private static instance: PluginBridge | null = null;
  private unlistenDshState: (() => void) | null = null;
  private unlistenTheme: (() => void) | null = null;
  private started = false;

  static getInstance(): PluginBridge {
    if (PluginBridge.instance === null) {
      PluginBridge.instance = new PluginBridge();
    }
    return PluginBridge.instance;
  }

  /** 启动全局监听（App 挂载时调用一次） */
  start(): void {
    if (this.started) return;
    this.started = true;

    window.addEventListener("message", this.onMessage);
    void onDshState((status: DshStatus) => {
      this.broadcast("dsh.state", status);
    }).then((un) => {
      this.unlistenDshState = un;
    });
    const themeHandler = (event: Event): void => {
      const detail = (event as CustomEvent<string>).detail;
      this.broadcast("theme.changed", detail);
    };
    window.addEventListener("dsh-theme-changed", themeHandler);
    this.unlistenTheme = () => window.removeEventListener("dsh-theme-changed", themeHandler);
  }

  stop(): void {
    window.removeEventListener("message", this.onMessage);
    this.unlistenDshState?.();
    this.unlistenTheme?.();
    this.started = false;
  }

  private onMessage = (event: MessageEvent): void => {
    if (!isBridgeRequest(event.data)) return;
    const request = event.data as BridgeMessage & { method: BridgeMethod };
    const source = event.source;
    void this.handleRequest(request)
      .then((data) => {
        this.respond(source, request, true, data);
      })
      .catch((err: unknown) => {
        this.respond(source, request, false, null, err instanceof Error ? err.message : String(err));
      });
  };

  private respond(
    source: MessageEvent["source"],
    request: BridgeMessage,
    ok: boolean,
    data: unknown,
    error?: string,
  ): void {
    if (source === null) return;
    const response: BridgeMessage = {
      id: request.id,
      pluginId: request.pluginId,
      type: "res",
      ok,
      payload: data,
      error,
    };
    source.postMessage(response, { targetOrigin: "*" });
  }

  /** 分发桥接方法到后端或宿主本地处理 */
  private async handleRequest(request: BridgeMessage): Promise<unknown> {
    const method = request.method ?? "";
    switch (method) {
      case "ping":
        return { ok: true, version: await appVersion() };
      case "ui.registerSidebar": {
        const payload = request.payload as { id: string; title: string; icon: string };
        usePluginStore.getState().registerSidebar({
          id: `${request.pluginId}:${payload.id}`,
          title: payload.title,
          icon: payload.icon,
        });
        return { ok: true };
      }
      case "ui.registerPanel": {
        const payload = request.payload as { id: string; title: string };
        usePluginStore.getState().registerPanel({
          pluginId: request.pluginId,
          panelId: payload.id,
          title: payload.title,
        });
        return { ok: true };
      }
      case "ui.registerContextMenu":
      case "tauri.invoke": {
        // 白名单校验在 Rust 端 runtime::execute
        return await pluginBridgeCall(request.pluginId, method, request.payload);
      }
      default: {
        return await pluginBridgeCall(request.pluginId, method, request.payload);
      }
    }
  }

  /** 向所有插件 iframe 广播事件 */
  broadcast(method: string, payload: unknown): void {
    const message: BridgeMessage = {
      id: `evt:${newBridgeId()}`,
      pluginId: "*",
      type: "evt",
      method: method as BridgeMethod,
      payload,
    };
    for (const frame of Array.from(document.querySelectorAll("iframe[data-plugin-frame]"))) {
      (frame as HTMLIFrameElement).contentWindow?.postMessage(message, { targetOrigin: "*" });
    }
  }

  /** 当前主题（供 activate 载荷携带） */
  currentTheme(): "light" | "dark" {
    return useThemeStore.getState().resolved;
  }
}

export const pluginBridge = PluginBridge.getInstance();

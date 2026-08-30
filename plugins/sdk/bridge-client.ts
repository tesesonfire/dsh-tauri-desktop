/**
 * dsh 插件 SDK：桥接客户端（postMessage 请求-响应封装）。
 *
 * 所有内置插件通过本 SDK 与宿主通信；第三方插件亦可直接打包本文件。
 * 协议见 docs/PLUGIN_API.md。
 */

export type BridgeMethod =
  | "fs.read"
  | "fs.write"
  | "exec.run"
  | "storage.get"
  | "storage.set"
  | "storage.delete"
  | "git.run"
  | "http.request"
  | "ui.registerSidebar"
  | "ui.registerPanel"
  | "ui.registerContextMenu"
  | "ui.showNotification"
  | "tauri.invoke"
  | "ping";

export interface BridgeRequestMessage {
  id: string;
  pluginId: string;
  type: "req";
  method: BridgeMethod;
  payload?: unknown;
}

export interface BridgeResponseMessage {
  id: string;
  pluginId: string;
  type: "res";
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export interface BridgeEventMessage {
  id: string;
  pluginId: string;
  type: "evt";
  method: string;
  payload?: unknown;
}

export type BridgeMessage = BridgeRequestMessage | BridgeResponseMessage | BridgeEventMessage;

export interface BridgeClientOptions {
  /** 插件 id（须与 manifest.id 一致） */
  pluginId: string;
  /** 宿主窗口（默认 window.parent） */
  target?: Window;
  /** 请求超时 ms，默认 15000 */
  timeoutMs?: number;
}

let seq = 0;

function nextId(): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `req-${seq}-${rand}`;
}

/** 桥接客户端：调用 `client.call(method, payload)` 即可。 */
export class BridgeClient {
  readonly pluginId: string;
  private readonly target: Window;
  private readonly timeoutMs: number;
  private readonly pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  private readonly eventHandlers = new Map<string, Set<(payload: unknown) => void>>();
  private listening = false;
  private listener?: (event: MessageEvent) => void;

  constructor(options: BridgeClientOptions) {
    this.pluginId = options.pluginId;
    this.target = options.target ?? (typeof window !== "undefined" ? window.parent : (undefined as unknown as Window));
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /** 开始监听宿主响应/事件（幂等） */
  listen(): void {
    if (this.listening || typeof window === "undefined") return;
    this.listening = true;
    this.listener = (event: MessageEvent) => {
      const data = event.data as BridgeMessage | null;
      if (typeof data !== "object" || data === null) return;
      if (data.type === "res" && data.pluginId === this.pluginId) {
        const pending = this.pending.get(data.id);
        if (pending !== undefined) {
          this.pending.delete(data.id);
          if (data.ok) pending.resolve(data.payload);
          else pending.reject(new Error(data.error ?? "bridge call failed"));
        }
      } else if (data.type === "evt") {
        const handlers = this.eventHandlers.get(data.method);
        if (handlers !== undefined) {
          for (const handler of handlers) handler(data.payload);
        }
      }
    };
    window.addEventListener("message", this.listener);
  }

  stopListen(): void {
    if (this.listener !== undefined && typeof window !== "undefined") {
      window.removeEventListener("message", this.listener);
    }
    this.listening = false;
  }

  /** 调用一个桥接方法 */
  call<T = unknown>(method: BridgeMethod, payload?: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = nextId();
      const timer =
        typeof window !== "undefined"
          ? window.setTimeout(() => {
              this.pending.delete(id);
              reject(new Error(`bridge call timeout: ${method}`));
            }, this.timeoutMs)
          : undefined;
      const clearTimer = (): void => {
        if (timer !== undefined) window.clearTimeout(timer);
      };
      this.pending.set(id, {
        resolve: (value) => {
          clearTimer();
          resolve(value as T);
        },
        reject: (reason) => {
          clearTimer();
          reject(reason);
        },
      });
      const message: BridgeRequestMessage = {
        id,
        pluginId: this.pluginId,
        type: "req",
        method,
        payload,
      };
      this.target?.postMessage(message, "*");
    });
  }

  /** 订阅宿主广播事件（theme.changed / dsh.state / panel.message） */
  on(method: string, handler: (payload: unknown) => void): () => void {
    const handlers = this.eventHandlers.get(method) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(method, handlers);
    return () => handlers.delete(handler);
  }

  /** 显式反订阅（on 返回的取消函数的别名，便于按名移除） */
  off(method: string, handler: (payload: unknown) => void): void {
    this.eventHandlers.get(method)?.delete(handler);
  }

  /** 一次性订阅：触发后自动移除；返回取消函数（在触发前手动取消）。 */
  once(method: string, handler: (payload: unknown) => void): () => void {
    const wrapped = (payload: unknown): void => {
      this.off(method, wrapped);
      handler(payload);
    };
    return this.on(method, wrapped);
  }

  /** 等待下一次事件；超时（默认 30s）以 Error reject。 */
  waitForEvent<T = unknown>(method: string, timeoutMs?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = this.once(method, (payload) => {
        clearTimeout(timer);
        resolve(payload as T);
      });
      const timer = setTimeout(() => {
        cancel();
        reject(new Error(`waitForEvent timeout: ${method}`));
      }, timeoutMs ?? 30000);
    });
  }

  /* ---------- 便捷 API ---------- */

  storageGet(key: string): Promise<string | null> {
    return this.call<{ value: string | null }>("storage.get", { key }).then(
      (res) => res.value,
    );
  }

  storageSet(key: string, value: string): Promise<void> {
    return this.call("storage.set", { key, value }) as Promise<void>;
  }

  storageDelete(key: string): Promise<boolean> {
    return this.call<{ removed: boolean }>("storage.delete", { key }).then(
      (res) => res.removed,
    );
  }

  fsRead(path: string): Promise<string> {
    return this.call<{ content: string }>("fs.read", { path }).then((r) => r.content);
  }

  fsWrite(path: string, content: string): Promise<void> {
    return this.call("fs.write", { path, content }) as Promise<void>;
  }

  exec(command: string, args: string[] = []): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return this.call("exec.run", { command, args }) as Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>;
  }

  git(args: string[], cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return this.call("git.run", { args, cwd }) as Promise<{
      code: number | null;
      stdout: string;
      stderr: string;
    }>;
  }

  httpRequest(url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<{ status: number; body: string }> {
    return this.call("http.request", { url, ...init }) as Promise<{
      status: number;
      body: string;
    }>;
  }

  showNotification(title: string, body: string): Promise<void> {
    return this.call("ui.showNotification", { title, body }) as Promise<void>;
  }

  registerSidebar(entry: { id: string; title: string; icon: string }): Promise<void> {
    return this.call("ui.registerSidebar", entry) as Promise<void>;
  }

  registerPanel(entry: { id: string; title: string }): Promise<void> {
    return this.call("ui.registerPanel", entry) as Promise<void>;
  }

  registerContextMenu(entry: {
    scope: "session" | "workspace" | "content" | "link" | "input";
    id: string;
    title: string;
    command?: string;
  }): Promise<void> {
    return this.call("ui.registerContextMenu", entry) as Promise<void>;
  }

  /** 面板间消息（经 panel 协议） */
  sendPanelMessage(panelId: string, data: unknown): void {
    if (typeof window !== "undefined") {
      window.postMessage(
        {
          id: `evt:${nextId()}`,
          pluginId: this.pluginId,
          type: "evt",
          method: "panel.message",
          payload: { panelId, data },
        } satisfies BridgeEventMessage,
        "*",
      );
    }
  }
}

/** 创建并激活客户端（listen + ping 探活） */
export function createClient(options: BridgeClientOptions): BridgeClient {
  const client = new BridgeClient(options);
  client.listen();
  return client;
}

import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pluginBridge } from "@/plugins/PluginBridge";
import { usePluginStore } from "@/stores/pluginStore";
import { useDshStore } from "@/stores/dshStore";
import { dshWebUrl, isTauriEnvironment, retryDelayMs } from "@/services/dshService";
import { serviceMock } from "../helpers/mockTauriService";
import type { DshStatus } from "@/types/dsh";

/** PluginBridge（宿主半边）/ dshStore 动作 / dshService 纯函数测试。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

function makeRequest(id: string, method: string, payload?: unknown): Record<string, unknown> {
  return { id, pluginId: "com.test.p", type: "req", method, payload };
}

function dispatchBridgeMessage(data: unknown): void {
  // 消息来源必须是已注册插件 iframe 的 contentWindow（与 PluginBridge 的来源校验一致）；
  // beforeEach 中建立的 com.test.p 帧的 contentWindow.postMessage 委托给被 spy 的
  // window.postMessage，使响应仍可被 postMessageSpy 捕获。
  const frame = document.querySelector("iframe[data-plugin-frame='com.test.p']");
  const source = (frame as HTMLIFrameElement | null)?.contentWindow ?? window;
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

/** 建立带 contentWindow 侦听的插件 iframe（广播目标）。 */
function addPluginFrame(id: string): ReturnType<typeof vi.fn> {
  const frame = document.createElement("iframe");
  frame.setAttribute("data-plugin-frame", id);
  document.body.appendChild(frame);
  const postMessage = vi.fn();
  Object.defineProperty(frame, "contentWindow", {
    value: { postMessage },
    configurable: true,
  });
  return postMessage;
}

describe("PluginBridge", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    usePluginStore.setState({ plugins: [], panels: [], sidebarEntries: [], activeSidebarId: null });
    document.body.innerHTML = "";
    pluginBridge.start();
    postMessageSpy = vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    // 建立请求来源插件 iframe：isFromPluginFrame 校验要求 event.source 归属某个
    // data-plugin-frame iframe 的 contentWindow。这里让它的 postMessage 委托给被
    // spy 的 window.postMessage，从而 dispatchBridgeMessage 发出的请求能通过来源
    // 校验，且宿主回传的响应仍由 postMessageSpy 捕获。
    const frame = document.createElement("iframe");
    frame.setAttribute("data-plugin-frame", "com.test.p");
    document.body.appendChild(frame);
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: window.postMessage.bind(window) },
      configurable: true,
    });
  });

  afterEach(() => {
    pluginBridge.stop();
    postMessageSpy.mockRestore();
    document.body.innerHTML = "";
  });

  it("answers ping with host version", async () => {
    serviceMock("appVersion").mockResolvedValue("9.9.9");
    dispatchBridgeMessage(makeRequest("r1", "ping"));
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    const response = postMessageSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(response.type).toBe("res");
    expect(response.id).toBe("r1");
    expect(response.ok).toBe(true);
    expect(response.payload).toEqual({ ok: true, version: "9.9.9" });
  });

  it("registers sidebar entries with pluginId prefix", async () => {
    dispatchBridgeMessage(
      makeRequest("r2", "ui.registerSidebar", { id: "main", title: "Main", icon: "puzzle" }),
    );
    await waitFor(() =>
      expect(usePluginStore.getState().sidebarEntries).toHaveLength(1),
    );
    const entry = usePluginStore.getState().sidebarEntries[0];
    expect(entry?.id).toBe("com.test.p:main");
    const response = postMessageSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(response.ok).toBe(true);
  });

  it("registers panels under the requesting plugin", async () => {
    dispatchBridgeMessage(makeRequest("r3", "ui.registerPanel", { id: "view", title: "View" }));
    await waitFor(() => expect(usePluginStore.getState().panels).toHaveLength(1));
    const panel = usePluginStore.getState().panels[0];
    expect(panel?.pluginId).toBe("com.test.p");
    expect(panel?.panelId).toBe("view");
  });

  it("forwards unknown methods to the backend bridge call", async () => {
    serviceMock("pluginBridgeCall").mockResolvedValue({ value: 42 });
    dispatchBridgeMessage(makeRequest("r4", "fs.read", { path: "x" }));
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    expect(serviceMock("pluginBridgeCall")).toHaveBeenCalledWith(
      "com.test.p",
      "fs.read",
      { path: "x" },
    );
    const response = postMessageSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(response.payload).toEqual({ value: 42 });
  });

  it("responds ok:false with error message when backend rejects", async () => {
    serviceMock("pluginBridgeCall").mockRejectedValue(new Error("权限不足"));
    dispatchBridgeMessage(makeRequest("r5", "exec.run", {}));
    await waitFor(() => expect(postMessageSpy).toHaveBeenCalled());
    const response = postMessageSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(response.ok).toBe(false);
    expect(response.error).toBe("权限不足");
  });

  it("ignores messages that are not bridge requests", () => {
    dispatchBridgeMessage({ id: "x", type: "evt" });
    dispatchBridgeMessage("plain string");
    expect(postMessageSpy).not.toHaveBeenCalled();
  });

  it("broadcasts events to all plugin frames", () => {
    const frameA = addPluginFrame("com.a");
    const frameB = addPluginFrame("com.b");
    pluginBridge.broadcast("theme.changed", "dark");
    expect(frameA).toHaveBeenCalledTimes(1);
    expect(frameB).toHaveBeenCalledTimes(1);
    const message = (frameA as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(message.type).toBe("evt");
    expect(message.method).toBe("theme.changed");
    expect(message.payload).toBe("dark");
    expect(message.pluginId).toBe("*");
  });

  it("re-broadcasts dsh-theme-changed custom events", () => {
    const frameA = addPluginFrame("com.a");
    window.dispatchEvent(new CustomEvent("dsh-theme-changed", { detail: "light" }));
    expect(frameA).toHaveBeenCalled();
    const message = (frameA as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(message.method).toBe("theme.changed");
    expect(message.payload).toBe("light");
  });
});

describe("dshStore actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDshStore.setState({ status: null, error: null, connect: "idle" as never, loading: false });
  });

  it("start stores status and surfaces backend errors", async () => {
    const okStatus = { state: "running", pid: 1, host: "127.0.0.1", port: 3080, profile: null, restarts: 0, lastError: null, startedAt: null };
    serviceMock("dshStart").mockResolvedValueOnce(okStatus);
    await useDshStore.getState().start();
    expect(useDshStore.getState().status?.state).toBe("running");
    serviceMock("dshStart").mockRejectedValueOnce(new Error("启动失败"));
    await expect(useDshStore.getState().start()).rejects.toThrow("启动失败");
    expect(useDshStore.getState().error).toContain("启动失败");
    expect(useDshStore.getState().loading).toBe(false);
  });

  it("stop marks connect stopped; restart resets to loading", async () => {
    serviceMock("dshStop").mockResolvedValue({ state: "stopped", pid: null, host: "127.0.0.1", port: 3080, profile: null, restarts: 0, lastError: null, startedAt: null });
    await useDshStore.getState().stop();
    expect(useDshStore.getState().connect).toBe("stopped");
    serviceMock("dshRestart").mockResolvedValue({ state: "starting", pid: null, host: "127.0.0.1", port: 3080, profile: null, restarts: 0, lastError: null, startedAt: null });
    await useDshStore.getState().restart();
    expect(useDshStore.getState().connect).toBe("loading");
  });

  it("subscribeEvents wires dsh.state transitions to connect state", async () => {
    let stateHandler: ((status: DshStatus) => void) | undefined;
    serviceMock("onDshState").mockImplementation(async (callback: (status: DshStatus) => void) => {
      stateHandler = callback;
      return () => undefined;
    });
    const dispose = await useDshStore.getState().subscribeEvents();
    expect(stateHandler).toBeTypeOf("function");
    stateHandler?.({ state: "running", pid: 1, host: "h", port: 1, profile: null, restarts: 0, lastError: null, startedAt: null } as DshStatus);
    expect(useDshStore.getState().connect).toBe("loading");
    stateHandler?.({ state: "stopped", pid: null, host: "h", port: 1, profile: null, restarts: 0, lastError: null, startedAt: null } as DshStatus);
    expect(useDshStore.getState().connect).toBe("stopped");
    stateHandler?.({ state: "crashed", pid: null, host: "h", port: 1, profile: null, restarts: 1, lastError: null, startedAt: null } as DshStatus);
    expect(useDshStore.getState().connect).toBe("disconnected");
    dispose();
  });
});

describe("dshService helpers", () => {
  it("retryDelayMs doubles with a 15s cap", () => {
    expect(retryDelayMs(0)).toBe(1000);
    expect(retryDelayMs(1)).toBe(2000);
    expect(retryDelayMs(2)).toBe(4000);
    expect(retryDelayMs(3)).toBe(8000);
    expect(retryDelayMs(10)).toBe(15000);
  });

  it("dshWebUrl builds the iframe url", () => {
    expect(dshWebUrl("127.0.0.1", 3080)).toBe("http://127.0.0.1:3080/");
    expect(dshWebUrl("localhost", 8080)).toBe("http://localhost:8080/");
  });

  it("isTauriEnvironment detects Tauri internals", () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    expect(isTauriEnvironment()).toBe(false);
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    expect(isTauriEnvironment()).toBe(true);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });
});

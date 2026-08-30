import { describe, expect, it, vi } from "vitest";
import { BridgeClient, createClient } from "../bridge-client";
import type { BridgeResponseMessage } from "../bridge-client";

/** SDK 桥接客户端单元测试：jsdom 下以自身 window 模拟宿主（parent === window）。 */

function emit(message: unknown): void {
  window.dispatchEvent(new MessageEvent("message", { data: message, origin: "dshplugin" }));
}

function respond(id: string, ok: boolean, payload?: unknown, error?: string): void {
  const message: BridgeResponseMessage = {
    id,
    pluginId: "com.test.p",
    type: "res",
    ok,
    payload,
    error,
  };
  emit(message);
}

describe("BridgeClient", () => {
  it("call resolves with response payload for matching id", async () => {
    const seen: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((msg) => seen.push(msg));
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const promise = client.call<string>("ping");
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const request = seen[0] as { id: string };
    respond(request.id, true, "pong");
    await expect(promise).resolves.toBe("pong");
    client.stopListen();
    vi.restoreAllMocks();
  });

  it("call rejects on error response and timeout", async () => {
    const seen: unknown[] = [];
    vi.spyOn(window, "postMessage").mockImplementation((msg) => seen.push(msg));
    const client = new BridgeClient({
      pluginId: "com.test.p",
      target: window,
      timeoutMs: 30,
    });
    client.listen();
    const failed = client.call("fs.read", { path: "x" });
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    respond((seen[0] as { id: string }).id, false, undefined, "denied");
    await expect(failed).rejects.toThrow("denied");

    const timedOut = client.call("fs.read", { path: "y" });
    await expect(timedOut).rejects.toThrow("bridge call timeout");
    client.stopListen();
    vi.restoreAllMocks();
  });

  it("on dispatches events and returned fn unsubscribes", () => {
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const handler = vi.fn();
    const cancel = client.on("dsh.state", handler);
    emit({ id: "evt:1", pluginId: "com.test.p", type: "evt", method: "dsh.state", payload: "running" });
    expect(handler).toHaveBeenCalledWith("running");
    cancel();
    emit({ id: "evt:2", pluginId: "com.test.p", type: "evt", method: "dsh.state", payload: "stopped" });
    expect(handler).toHaveBeenCalledTimes(1);
    client.stopListen();
  });

  it("off removes a named handler", () => {
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const handler = vi.fn();
    client.on("theme.changed", handler);
    client.off("theme.changed", handler);
    emit({ id: "evt:3", pluginId: "com.test.p", type: "evt", method: "theme.changed", payload: "dark" });
    expect(handler).not.toHaveBeenCalled();
    client.stopListen();
  });

  it("once fires exactly once", () => {
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const handler = vi.fn();
    client.once("panel.message", handler);
    emit({ id: "evt:4", pluginId: "com.test.p", type: "evt", method: "panel.message", payload: 1 });
    emit({ id: "evt:5", pluginId: "com.test.p", type: "evt", method: "panel.message", payload: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
    client.stopListen();
  });

  it("waitForEvent resolves on next event and cancels subscription", async () => {
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const waiting = client.waitForEvent<string>("dsh.state", 1000);
    await new Promise((r) => setTimeout(r, 0));
    emit({ id: "evt:6", pluginId: "com.test.p", type: "evt", method: "dsh.state", payload: "running" });
    await expect(waiting).resolves.toBe("running");
    client.stopListen();
  });

  it("waitForEvent rejects on timeout and unsubscribes", async () => {
    const client = new BridgeClient({ pluginId: "com.test.p", target: window });
    client.listen();
    const waiting = client.waitForEvent("dsh.state", 30);
    await expect(waiting).rejects.toThrow("waitForEvent timeout");
    // 超时后事件到达不应触发未处理拒绝
    emit({ id: "evt:7", pluginId: "com.test.p", type: "evt", method: "dsh.state", payload: "late" });
    client.stopListen();
  });

  it("createClient listens immediately", () => {
    const client = createClient({ pluginId: "com.test.p", target: window });
    const handler = vi.fn();
    client.on("dsh.state", handler);
    emit({ id: "evt:8", pluginId: "com.test.p", type: "evt", method: "dsh.state", payload: "ok" });
    expect(handler).toHaveBeenCalled();
    client.stopListen();
  });
});

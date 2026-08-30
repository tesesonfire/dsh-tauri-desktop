import { afterEach, describe, expect, it, vi } from "vitest";
import { pingDsh } from "@/services/dshService";
import { isBridgeRequest, newBridgeId } from "@/services/pluginApi";

/** 心跳探活（mock fetch）与桥接消息守卫的边界测试。 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pingDsh", () => {
  it("returns true when the network layer succeeds (opaque response counts)", async () => {
    // no-cors 模式下真实环境返回 opaque response；这里以普通响应模拟网络层成功
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("ok"))));
    await expect(pingDsh("127.0.0.1", 3080, 500)).resolves.toBe(true);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3080/",
      expect.objectContaining({ mode: "no-cors", cache: "no-store" }),
    );
  });

  it("returns false when fetch rejects (connection refused)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(pingDsh("127.0.0.1", 3080, 500)).resolves.toBe(false);
  });

  it("returns false on timeout abort", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    await expect(pingDsh("127.0.0.1", 3080, 20)).resolves.toBe(false);
  });
});

describe("isBridgeRequest", () => {
  it("accepts well-formed bridge requests", () => {
    const message = { id: "r1", pluginId: "com.a", type: "req", method: "ping" };
    expect(isBridgeRequest(message)).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isBridgeRequest(null)).toBe(false);
    expect(isBridgeRequest("ping")).toBe(false);
    expect(isBridgeRequest(42)).toBe(false);
    expect(isBridgeRequest({ type: "req" })).toBe(false); // 缺 id/pluginId/method
    expect(isBridgeRequest({ id: "r", pluginId: "p", type: "res" })).toBe(false); // 非 req
    expect(isBridgeRequest({ id: "r", pluginId: "p", type: "evt", method: "x" })).toBe(false);
    expect(isBridgeRequest({ id: 1, pluginId: "p", type: "req", method: "ping" })).toBe(false); // id 非字符串
    expect(isBridgeRequest({ id: "r", pluginId: "p", type: "req", method: 2 })).toBe(false); // method 非字符串
  });
});

describe("newBridgeId", () => {
  it("generates unique non-empty ids", () => {
    const a = newBridgeId();
    const b = newBridgeId();
    expect(a).not.toBe("");
    expect(b).not.toBe("");
    expect(a).not.toBe(b);
  });
});

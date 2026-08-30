import { describe, expect, it } from "vitest";
import { BridgeClient } from "../../sdk/bridge-client";
import { BridgeStatusModel, invokeWithTracking, pingHost } from "../src/bridge";

describe("BridgeStatusModel", () => {
  it("records and limits history to 100 entries", () => {
    const model = new BridgeStatusModel();
    for (let i = 0; i < 120; i++) {
      model.record({ method: "ping", at: i, ok: true, durationMs: 1 });
    }
    expect(model.recent(1000)).toHaveLength(100);
  });

  it("computes success rate and average duration", () => {
    const model = new BridgeStatusModel();
    model.record({ method: "a", at: 0, ok: true, durationMs: 10 });
    model.record({ method: "b", at: 1, ok: false, durationMs: 30 });
    expect(model.successRate()).toBeCloseTo(0.5);
    expect(model.averageDuration()).toBeCloseTo(20);
    expect(new BridgeStatusModel().successRate()).toBeNull();
    expect(new BridgeStatusModel().averageDuration()).toBeNull();
  });

  it("recent returns newest first", () => {
    const model = new BridgeStatusModel();
    model.record({ method: "first", at: 1, ok: true, durationMs: 1 });
    model.record({ method: "second", at: 2, ok: true, durationMs: 1 });
    const recent = model.recent(2);
    expect(recent[0]?.method).toBe("second");
    expect(recent[1]?.method).toBe("first");
  });

  it("clear resets state", () => {
    const model = new BridgeStatusModel();
    model.record({ method: "x", at: 0, ok: true, durationMs: 1 });
    model.clear();
    expect(model.successRate()).toBeNull();
  });
});

describe("invokeWithTracking", () => {
  it("records success and failure around client.call", async () => {
    const model = new BridgeStatusModel();
    const fakeClient = {
      call: async (method: string): Promise<unknown> => {
        if (method === "boom") throw new Error("boom");
        return { ok: true };
      },
    } as unknown as BridgeClient;

    await invokeWithTracking(fakeClient, "ping", undefined, model);
    await expect(
      invokeWithTracking(fakeClient, "boom" as Parameters<BridgeClient["call"]>[0], undefined, model),
    ).rejects.toThrow("boom");
    expect(model.successRate()).toBeCloseTo(0.5);
  });
});

describe("pingHost", () => {
  it("returns version on success", async () => {
    const fakeClient = {
      call: async (): Promise<unknown> => ({ ok: true, version: "0.1.0" }),
    } as unknown as BridgeClient;
    const health = await pingHost(fakeClient);
    expect(health.hostReachable).toBe(true);
    expect(health.version).toBe("0.1.0");
  });

  it("returns error info on failure", async () => {
    const fakeClient = {
      call: async (): Promise<unknown> => {
        throw new Error("host gone");
      },
    } as unknown as BridgeClient;
    const health = await pingHost(fakeClient);
    expect(health.hostReachable).toBe(false);
    expect(health.lastError).toBe("host gone");
  });
});

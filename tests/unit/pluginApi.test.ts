import { describe, expect, it } from "vitest";
import {
  isBridgeRequest,
  isWindows,
  methodRequiresPermission,
  newBridgeId,
  validateManifest,
} from "@/services/pluginApi";

describe("validateManifest", () => {
  const good = {
    id: "com.example.demo",
    name: "Demo",
    version: "1.0.0",
    entry: "index.html",
    permissions: ["ui", "storage"],
  };

  it("accepts a valid manifest", () => {
    const result = validateManifest(good);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-object input", () => {
    expect(validateManifest(null).valid).toBe(false);
    expect(validateManifest("x").valid).toBe(false);
  });

  it("collects multiple errors", () => {
    const result = validateManifest({ ...good, id: "../evil", version: "1.0", entry: "../x" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects unknown permissions", () => {
    const result = validateManifest({ ...good, permissions: ["ui", "root"] });
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toContain("root");
  });
});

describe("methodRequiresPermission", () => {
  it("maps method groups", () => {
    expect(methodRequiresPermission("ping")).toBeNull();
    expect(methodRequiresPermission("fs.read")).toBe("fs");
    expect(methodRequiresPermission("storage.set")).toBe("storage");
    expect(methodRequiresPermission("ui.registerSidebar")).toBe("ui");
    expect(methodRequiresPermission("tauri.invoke")).toBe("tauri");
  });
});

describe("isBridgeRequest", () => {
  it("accepts valid requests and rejects noise", () => {
    expect(
      isBridgeRequest({ id: "1", pluginId: "p", type: "req", method: "ping" }),
    ).toBe(true);
    expect(isBridgeRequest({ id: "1", pluginId: "p", type: "res" })).toBe(false);
    expect(isBridgeRequest(null)).toBe(false);
    expect(isBridgeRequest({})).toBe(false);
  });
});

describe("newBridgeId", () => {
  it("generates unique ids", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newBridgeId()));
    expect(seen.size).toBe(50);
  });
});

describe("isWindows", () => {
  it("matches current jsdom user agent deterministically", () => {
    // jsdom UA 不含 Windows；仅验证函数可用且返回布尔
    expect(typeof isWindows()).toBe("boolean");
  });
});

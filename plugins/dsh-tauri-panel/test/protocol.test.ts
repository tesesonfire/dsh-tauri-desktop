import { describe, expect, it } from "vitest";
import { PanelRegistry } from "../src/protocol";

describe("PanelRegistry", () => {
  it("register/activate/unregister lifecycle", () => {
    const registry = new PanelRegistry();
    registry.register("a", "view", "视图 A", 1);
    registry.register("b", "logs", "日志 B", 2);
    expect(registry.list().map((p) => p.panelId)).toEqual(["view", "logs"]);
    // 首个注册自动激活
    expect(registry.active?.panelId).toBe("view");

    expect(registry.activate("b", "logs")?.title).toBe("日志 B");
    expect(registry.active?.pluginId).toBe("b");

    expect(registry.unregister("b", "logs")).toBe(true);
    // 激活面板被移除后回退到剩余面板
    expect(registry.active?.panelId).toBe("view");
  });

  it("re-register updates title instead of duplicating", () => {
    const registry = new PanelRegistry();
    registry.register("a", "view", "旧标题", 1);
    registry.register("a", "view", "新标题", 2);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.title).toBe("新标题");
  });

  it("activate unknown panel returns null", () => {
    const registry = new PanelRegistry();
    expect(registry.activate("x", "y")).toBeNull();
  });
});

describe("panel messaging", () => {
  it("routes direct and broadcast messages", () => {
    const registry = new PanelRegistry();
    registry.register("a", "view", "A", 1);
    registry.register("b", "logs", "B", 2);

    // 定向消息
    const direct = registry.send(
      { pluginId: "a", panelId: "view" },
      PanelRegistry.key("b", "logs"),
      { hello: 1 },
      10,
    );
    expect(registry.route(direct)).toEqual(["b::logs"]);

    // 广播（不含发送者）
    const broadcast = registry.send({ pluginId: "a", panelId: "view" }, null, "hi", 11);
    expect(registry.route(broadcast)).toEqual(["b::logs"]);
  });

  it("inbox replays messages for target panel", () => {
    const registry = new PanelRegistry();
    registry.register("a", "view", "A", 1);
    registry.register("b", "logs", "B", 2);
    registry.send({ pluginId: "a", panelId: "view" }, PanelRegistry.key("b", "logs"), "direct", 10);
    registry.send({ pluginId: "a", panelId: "view" }, null, "broadcast", 11);
    const inbox = registry.inbox("b", "logs");
    expect(inbox.map((m) => m.payload)).toEqual(["direct", "broadcast"]);
    // 发送者自己不收广播
    expect(registry.inbox("a", "view").filter((m) => m.toPanelId === null)).toHaveLength(0);
  });

  it("direct message to unknown panel is dropped", () => {
    const registry = new PanelRegistry();
    registry.register("a", "view", "A", 1);
    const message = registry.send(
      { pluginId: "a", panelId: "view" },
      "ghost::panel",
      "lost",
      10,
    );
    expect(registry.route(message)).toEqual([]);
  });
});

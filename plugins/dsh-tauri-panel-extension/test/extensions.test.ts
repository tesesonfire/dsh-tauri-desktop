import { describe, expect, it } from "vitest";
import {
  ExtensionRegistry,
  importCommands,
  isValidExtensionId,
  normalizeRepoRef,
} from "../src/extensions";

describe("isValidExtensionId", () => {
  it("accepts lowercase ids", () => {
    expect(isValidExtensionId("skill.web-search")).toBe(true);
    expect(isValidExtensionId("mcp-server-1")).toBe(true);
  });

  it("rejects bad ids", () => {
    expect(isValidExtensionId("A")).toBe(false);
    expect(isValidExtensionId("-bad")).toBe(false);
    expect(isValidExtensionId("has space")).toBe(false);
    expect(isValidExtensionId("")).toBe(false);
  });
});

describe("ExtensionRegistry", () => {
  it("upsert/enabled/remove lifecycle", () => {
    const registry = new ExtensionRegistry();
    registry.upsert({ id: "skill.a", kind: "skill", name: "A", description: "", spec: "..." });
    expect(registry.get("skill.a")?.status).toBe("enabled");

    registry.setEnabled("skill.a", false);
    expect(registry.list("skill", "disabled")).toHaveLength(1);
    expect(registry.list("skill", "enabled")).toHaveLength(0);
    expect(registry.list("mcp")).toHaveLength(0);

    expect(registry.remove("skill.a")).toBe(true);
    expect(registry.get("skill.a")).toBeNull();
  });

  it("upsert preserves status/addedAt on update", () => {
    const registry = new ExtensionRegistry();
    registry.upsert({ id: "mcp.x", kind: "mcp", name: "X", description: "", spec: "cmd" });
    registry.setEnabled("mcp.x", false);
    const updated = registry.upsert({ id: "mcp.x", kind: "mcp", name: "X2", description: "", spec: "cmd2" });
    expect(updated.status).toBe("disabled");
    expect(updated.name).toBe("X2");
  });

  it("rejects invalid ids", () => {
    const registry = new ExtensionRegistry();
    expect(() =>
      registry.upsert({ id: "BAD", kind: "skill", name: "B", description: "", spec: "" }),
    ).toThrow("无效扩展 id");
  });

  it("toJSON/load roundtrip", () => {
    const registry = new ExtensionRegistry();
    registry.upsert({ id: "skill.a", kind: "skill", name: "A", description: "", spec: "s" });
    const snapshot = registry.toJSON();
    const restored = new ExtensionRegistry();
    restored.load(JSON.parse(JSON.stringify(snapshot)));
    expect(restored.get("skill.a")?.name).toBe("A");
  });
});

describe("normalizeRepoRef", () => {
  it("expands owner/repo shorthand", () => {
    expect(normalizeRepoRef("user/repo")).toBe("https://github.com/user/repo");
    expect(normalizeRepoRef("user/repo.git")).toBe("https://github.com/user/repo");
  });

  it("keeps absolute urls", () => {
    expect(normalizeRepoRef("https://gitlab.com/g/r")).toBe("https://gitlab.com/g/r");
  });

  it("rejects garbage", () => {
    expect(() => normalizeRepoRef("not a repo")).toThrow("无法识别的仓库地址");
  });
});

describe("importCommands", () => {
  it("clone then read last commit", () => {
    expect(importCommands("https://github.com/u/r", "~/.dsh/extensions/r")).toEqual([
      ["clone", "https://github.com/u/r", "~/.dsh/extensions/r"],
      ["-C", "~/.dsh/extensions/r", "log", "-1", "--format=%h %s"],
    ]);
  });
});

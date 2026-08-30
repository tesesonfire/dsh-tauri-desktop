import { describe, expect, it } from "vitest";
import {
  ContextMenuRegistry,
  defaultMenuItems,
  isValidScope,
  scopeFromTarget,
} from "../src/menus";

describe("isValidScope", () => {
  it("recognizes the five scopes", () => {
    for (const scope of ["session", "workspace", "content", "link", "input"]) {
      expect(isValidScope(scope)).toBe(true);
    }
    expect(isValidScope("other")).toBe(false);
  });
});

describe("ContextMenuRegistry", () => {
  it("register/build per scope keeps order", () => {
    const registry = new ContextMenuRegistry();
    for (const item of defaultMenuItems()) registry.register(item);
    const sessionMenu = registry.buildMenu("session");
    expect(sessionMenu.map((i) => i.id)).toEqual([
      "session.archive",
      "session.copyTitle",
      "session.sep",
    ]);
    expect(registry.buildMenu("link")).toHaveLength(1);
    expect(registry.buildMenu("input")).toHaveLength(1);
  });

  it("rejects invalid scope and empty titles", () => {
    const registry = new ContextMenuRegistry();
    expect(() =>
      registry.register({ id: "x", scope: "bogus" as never, title: "X" }),
    ).toThrow("无效菜单作用域");
    expect(() => registry.register({ id: "y", scope: "content", title: "" })).toThrow(
      "菜单项标题不能为空",
    );
    // 分隔线允许空标题
    expect(() =>
      registry.register({ id: "z", scope: "content", title: "", separator: true }),
    ).not.toThrow();
  });

  it("re-register updates, unregister removes", () => {
    const registry = new ContextMenuRegistry();
    registry.register({ id: "a", scope: "content", title: "旧" });
    registry.register({ id: "a", scope: "content", title: "新" });
    expect(registry.buildMenu("content")[0]?.title).toBe("新");
    expect(registry.unregister("a")).toBe(true);
    expect(registry.has("a")).toBe(false);
  });

  it("buildMenu supports filtering", () => {
    const registry = new ContextMenuRegistry();
    for (const item of defaultMenuItems()) registry.register(item);
    const withoutSeparator = registry.buildMenu("session", (item) => !item.separator);
    expect(withoutSeparator).toHaveLength(2);
  });
});

describe("scopeFromTarget", () => {
  it("maps targets by closest/href/tagName", () => {
    const sessionEl = {
      tagName: "DIV",
      closest: (selector: string) => (selector === "[data-dsh-session]" ? {} : undefined),
    };
    expect(scopeFromTarget(sessionEl)).toBe("session");

    const workspaceEl = {
      tagName: "DIV",
      closest: (selector: string) => (selector === "[data-dsh-workspace]" ? {} : undefined),
    };
    expect(scopeFromTarget(workspaceEl)).toBe("workspace");

    expect(scopeFromTarget({ tagName: "A", href: "https://x" })).toBe("link");
    expect(scopeFromTarget({ tagName: "INPUT" })).toBe("input");
    expect(scopeFromTarget({ tagName: "TEXTAREA" })).toBe("input");
    expect(
      scopeFromTarget({
        tagName: "P",
        closest: (selector: string) => (selector === "[contenteditable]" ? {} : undefined),
      }),
    ).toBe("input");
    expect(scopeFromTarget({ tagName: "P" })).toBe("content");
  });
});

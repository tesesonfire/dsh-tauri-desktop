import { describe, expect, it, vi } from "vitest";
import {
  applyCssVariables,
  mergeCssVariables,
  resolveTheme,
  ThemeManager,
} from "../src/theme";

describe("resolveTheme", () => {
  it("resolves system by prefersDark", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

describe("mergeCssVariables", () => {
  it("user overrides win", () => {
    const merged = mergeCssVariables({ "--a": "1", "--b": "2" }, { "--b": "3" });
    expect(merged["--a"]).toBe("1");
    expect(merged["--b"]).toBe("3");
  });
});

describe("applyCssVariables", () => {
  it("skips non-custom properties and counts applied", () => {
    const store = new Map<string, string>();
    const fakeElement = {
      style: {
        setProperty: (name: string, value: string) => void store.set(name, value),
      } as unknown as CSSStyleDeclaration,
    };
    const count = applyCssVariables(fakeElement, {
      "--brand-accent": "#4d6bfe",
      "color": "red",
    });
    expect(count).toBe(1);
    expect(store.get("--brand-accent")).toBe("#4d6bfe");
  });

  it("supports raw setProperty targets", () => {
    const setProperty = vi.fn();
    const count = applyCssVariables({ setProperty }, { "--x": "1" });
    expect(count).toBe(1);
    expect(setProperty).toHaveBeenCalledWith("--x", "1");
  });
});

describe("ThemeManager", () => {
  it("notifies subscribers on mode change", () => {
    const manager = new ThemeManager();
    const listener = vi.fn();
    manager.subscribe(listener);
    manager.setMode("dark", false);
    expect(listener).toHaveBeenCalledWith("dark");
    manager.setMode("system", true);
    expect(listener).toHaveBeenCalledWith("dark");
    manager.setMode("system", false);
    expect(listener).toHaveBeenCalledWith("light");
  });

  it("onSystemChange ignores when mode is explicit", () => {
    const manager = new ThemeManager();
    manager.setMode("light", false);
    expect(manager.onSystemChange(true)).toBeNull();
    manager.setMode("system", false);
    expect(manager.onSystemChange(true)).toBe("dark");
  });

  it("unsubscribe stops notifications", () => {
    const manager = new ThemeManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    unsubscribe();
    manager.setMode("dark", false);
    expect(listener).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { useDshStore } from "@/stores/dshStore";
import { useToastStore, toast } from "@/stores/toastStore";
import { useThemeStore } from "@/stores/themeStore";
import { useWindowStore, detectPlatform } from "@/stores/windowStore";
import type { LogLine } from "@/types/dsh";

describe("dshStore", () => {
  it("appendLog caps the buffer at 500 lines", () => {
    const store = useDshStore.getState();
    store.clearLogs();
    for (let i = 0; i < 520; i++) {
      useDshStore.getState().appendLog({
        level: "info",
        line: `line-${i}`,
        ts: new Date(2026, 0, 1).toISOString(),
      });
    }
    const logs = useDshStore.getState().logs;
    expect(logs).toHaveLength(500);
    expect(logs[0]?.line).toBe("line-20");
    expect(logs[499]?.line).toBe("line-519");
  });

  it("clearLogs empties the buffer", () => {
    useDshStore.getState().appendLog({ level: "info", line: "x", ts: "" } as LogLine);
    useDshStore.getState().clearLogs();
    expect(useDshStore.getState().logs).toHaveLength(0);
  });

  it("setConnect updates connection state", () => {
    useDshStore.getState().setConnect("connected");
    expect(useDshStore.getState().connect).toBe("connected");
    useDshStore.getState().setConnect("disconnected");
    expect(useDshStore.getState().connect).toBe("disconnected");
  });
});

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("push adds and dismiss removes", () => {
    toast.info("hello");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    const id = useToastStore.getState().toasts[0]?.id ?? "";
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("auto-dismisses after timeout", () => {
    vi.useFakeTimers();
    toast.warn("bye");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe("themeStore", () => {
  it("setMode applies dark class and persists", () => {
    const store = useThemeStore.getState();
    store.setMode("dark");
    expect(useThemeStore.getState().resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("dsh-theme")).toBe("dark");
    store.setMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    store.setMode("system");
  });
});

describe("windowStore", () => {
  it("setPlatform / setMaximized", () => {
    useWindowStore.getState().setPlatform("windows");
    useWindowStore.getState().setMaximized(true);
    expect(useWindowStore.getState().platform).toBe("windows");
    expect(useWindowStore.getState().maximized).toBe(true);
  });

  it("detectPlatform returns a known platform", () => {
    expect(["macos", "windows", "linux", "unknown"]).toContain(detectPlatform());
  });
});

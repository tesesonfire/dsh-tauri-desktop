import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTauriCommand } from "@/hooks/useTauriCommand";
import { useToastStore } from "@/stores/toastStore";
import { useThemeStore } from "@/stores/themeStore";

describe("useTauriCommand", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("transitions loading → data on success", async () => {
    const fn = vi.fn(async (n: number) => n * 2);
    const { result } = renderHook(() => useTauriCommand(fn, { silent: true }));

    expect(result.current.loading).toBe(false);
    let promise: Promise<number | null> | undefined;
    act(() => {
      promise = result.current.run(21);
    });
    expect(result.current.loading).toBe(true);
    await act(async () => {
      await promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("captures error and toasts when not silent", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => useTauriCommand(fn));
    let promise: Promise<unknown> | undefined;
    act(() => {
      promise = result.current.run();
    });
    await act(async () => {
      await promise;
    });
    expect(result.current.error).toContain("boom");
    expect(result.current.data).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0]?.kind).toBe("error");
  });

  it("silent mode skips toast", async () => {
    const fn = vi.fn(async () => {
      throw new Error("quiet");
    });
    const { result } = renderHook(() => useTauriCommand(fn, { silent: true }));
    let promise: Promise<unknown> | undefined;
    act(() => {
      promise = result.current.run();
    });
    await act(async () => {
      await promise;
    });
    expect(result.current.error).toContain("quiet");
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("setData overrides stored result", async () => {
    const fn = vi.fn(async () => "first");
    const { result } = renderHook(() => useTauriCommand(fn, { silent: true }));
    let promise: Promise<unknown> | undefined;
    act(() => {
      promise = result.current.run();
    });
    await act(async () => {
      await promise;
    });
    act(() => {
      result.current.setData("overridden");
    });
    expect(result.current.data).toBe("overridden");
  });
});

describe("useThemeStore integration", () => {
  it("init reads persisted theme and applies class", async () => {
    localStorage.setItem("dsh-theme", "dark");
    const { result } = renderHook(() => useThemeStore());
    await waitFor(() => {
      result.current.init();
    });
    expect(result.current.mode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useThemeStore.getState().setMode("system");
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginSystem } from "@/hooks/usePluginSystem";
import { usePluginStore } from "@/stores/pluginStore";
import { useToastStore } from "@/stores/toastStore";
import { serviceMock } from "../helpers/mockTauriService";

/** usePluginSystem hook 测试：刷新副作用、启用/卸载的 Toast 反馈与错误路径。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule: b } = await import("../helpers/mockTauriService");
  return b();
});

describe("usePluginSystem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePluginStore.setState({
      plugins: [],
      sidebarEntries: [],
      panels: [],
      activeSidebarId: null,
      loading: false,
      error: null,
    });
    useToastStore.setState({ toasts: [] });
    serviceMock("pluginList").mockResolvedValue([]);
    serviceMock("pluginSetEnabled").mockResolvedValue(undefined);
    serviceMock("pluginUninstall").mockResolvedValue(undefined);
  });

  it("refreshes the plugin list on mount", async () => {
    renderHook(() => usePluginSystem());
    await waitFor(() => expect(serviceMock("pluginList")).toHaveBeenCalled());
  });

  it("enable shows success toast and persists via backend", async () => {
    const { result } = renderHook(() => usePluginSystem());
    await result.current.enable("com.a", true);
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message.includes("已启用"))).toBe(true),
    );
    expect(serviceMock("pluginSetEnabled")).toHaveBeenCalledWith("com.a", true);
  });

  it("disable shows the corresponding toast", async () => {
    const { result } = renderHook(() => usePluginSystem());
    await result.current.enable("com.a", false);
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message.includes("已禁用"))).toBe(true),
    );
  });

  it("enable failure surfaces an error toast instead of throwing", async () => {
    serviceMock("pluginSetEnabled").mockRejectedValue(new Error("[plugin_set_enabled] 拒绝"));
    const { result } = renderHook(() => usePluginSystem());
    await result.current.enable("com.a", true);
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.kind === "error")).toBe(true),
    );
  });

  it("uninstall shows success toast and removes sidebar entries", async () => {
    usePluginStore.setState({
      sidebarEntries: [{ id: "com.a:main", title: "Main", icon: "puzzle" }],
    });
    const { result } = renderHook(() => usePluginSystem());
    await result.current.uninstall("com.a");
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message === "插件已卸载")).toBe(true),
    );
    expect(usePluginStore.getState().sidebarEntries).toHaveLength(0);
  });

  it("uninstall failure surfaces an error toast", async () => {
    serviceMock("pluginUninstall").mockRejectedValue(new Error("[plugin_uninstall] 失败"));
    const { result } = renderHook(() => usePluginSystem());
    await result.current.uninstall("com.a");
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.kind === "error")).toBe(true),
    );
  });
});

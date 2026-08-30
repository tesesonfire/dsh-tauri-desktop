import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MainPage from "@/pages/MainPage";
import { useDshStore } from "@/stores/dshStore";
import { usePluginStore } from "@/stores/pluginStore";
import { stubEmptyBackendContracts } from "../helpers/mockTauriService";
import type { PluginInfo } from "@/types/plugin";

/** MainPage 集成测试：核心过期横幅 + 右侧插件面板坞。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

vi.mock("@/plugins/PluginHost", () => ({
  PluginHost: () => <div data-testid="host-stub" />,
}));

function makePlugin(id: string, enabled = true): PluginInfo {
  return {
    manifest: {
      id,
      name: id,
      version: "0.1.0",
      description: "",
      author: "",
      entry: "index.html",
      permissions: [],
      contributes: { sidebar: [], panel: [], command: [], setting: [] },
    },
    dir: "",
    enabled,
    builtin: true,
    error: null,
  };
}

describe("MainPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubEmptyBackendContracts();
    useDshStore.setState({
      status: null,
      coreOutdated: null,
      connect: "idle" as never,
    });
    usePluginStore.setState({ plugins: [], panels: [], sidebarEntries: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("hides the core outdated banner by default", () => {
    const { container } = render(<MainPage />);
    expect(container.textContent).not.toContain("dsh 核心有新版本");
  });

  it("shows the core outdated banner with versions", () => {
    useDshStore.setState({ coreOutdated: { current: "0.1.0", latest: "0.2.0" } });
    const { container } = render(<MainPage />);
    expect(container.textContent).toContain("dsh 核心有新版本");
    expect(container.textContent).toContain("v0.1.0");
    expect(container.textContent).toContain("v0.2.0");
    expect(container.textContent).toContain("离线时已保留本地版本");
  });

  it("hides the plugin dock when no panels registered", () => {
    render(<MainPage />);
    expect(screen.queryByTestId("plugin-dock")).toBeNull();
  });

  it("shows the plugin dock with registered panel tabs on dsh activity", () => {
    usePluginStore.setState({
      plugins: [makePlugin("com.test.dock")],
      panels: [{ pluginId: "com.test.dock", panelId: "view", title: "会话面板" }],
    });
    render(<MainPage />);
    const dock = screen.getByTestId("plugin-dock");
    expect(dock).toBeTruthy();
    expect(screen.getByRole("button", { name: "会话面板" })).toBeTruthy();
    // 激活面板默认取第一个，宿主应渲染
    expect(screen.getByTestId("host-stub")).toBeTruthy();
  });

  it("dock omits hosts of disabled plugins but keeps tabs", () => {
    usePluginStore.setState({
      plugins: [makePlugin("com.test.dock", false)],
      panels: [{ pluginId: "com.test.dock", panelId: "view", title: "会话面板" }],
    });
    render(<MainPage />);
    expect(screen.getByTestId("plugin-dock")).toBeTruthy();
    expect(screen.getByRole("button", { name: "会话面板" })).toBeTruthy();
    expect(screen.queryByTestId("host-stub")).toBeNull();
  });
});

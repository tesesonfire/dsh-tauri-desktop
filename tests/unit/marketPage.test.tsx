import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginStore } from "@/stores/pluginStore";
import type { MarketPlugin } from "@/types/plugin";
import type { PluginInfo } from "@/types/plugin";

/** PluginMarketPage 行为测试：共享 mock 工厂，走市场三标签页交互。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

vi.mock("@/plugins/PluginHost", () => ({
  PluginHost: () => <div data-testid="plugin-host-stub" />,
}));

import PluginMarketPage from "@/pages/PluginMarketPage";
import { serviceMock } from "../helpers/mockTauriService";

const registryEntry: MarketPlugin = {
  id: "com.dsh-tauri.panel",
  name: "DSH Tauri Panel",
  version: "0.1.0",
  description: "面板宿主",
  repo: "dsh-tauri-desk/dsh-tauri-plugins",
  path: "packages/dsh-tauri-panel",
  official: true,
  tags: ["面板"],
};

function seedPlugins(list: Partial<PluginInfo>[]): void {
  const plugins = list.map((p) => ({
    manifest: {
      id: "x",
      name: "X",
      version: "0.1.0",
      description: "",
      author: "",
      entry: "index.html",
      permissions: [],
      contributes: { sidebar: [], panel: [], command: [], setting: [] },
      ...p.manifest,
    },
    dir: "",
    enabled: true,
    builtin: true,
    error: null,
    ...p,
  })) as PluginInfo[];
  usePluginStore.setState({ plugins });
  // 页面挂载即 refresh()，pluginList 结果会覆盖 store 预置，需保持一致
  serviceMock("pluginList").mockResolvedValue(plugins);
}

describe("PluginMarketPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedPlugins([]);
    serviceMock("marketOfficial").mockResolvedValue({ updatedAt: "2026-08-30", plugins: [registryEntry] });
    serviceMock("marketUpgrades").mockResolvedValue([]);
    serviceMock("presetsGet").mockResolvedValue({
      version: 1,
      updatedAt: "2026-08-30",
      presets: [
        {
          id: "dsh-notification",
          name: "DSH Notification",
          description: "状态通知",
          icon: "bell",
          category: "productivity",
          source: "builtin",
          recommended: true,
          permissions: ["ui", "notification"],
          pluginId: "com.dsh-tauri.notification",
        },
      ],
    });
    serviceMock("pluginList").mockResolvedValue([]);
    serviceMock("marketSearch").mockResolvedValue([]);
  });

  it("renders official registry entries with install action", async () => {
    render(<PluginMarketPage />);
    await waitFor(() => expect(screen.getByText("DSH Tauri Panel")).toBeTruthy());
    expect(screen.getByRole("button", { name: "安装" })).toBeTruthy();
    expect(screen.getByText(/快照 2026-08-30/)).toBeTruthy();
  });

  it("marks installed plugins and hides install button", async () => {
    seedPlugins([
      { manifest: { id: "com.dsh-tauri.panel", name: "DSH Tauri Panel", version: "0.1.0" } as never },
    ]);
    render(<PluginMarketPage />);
    await waitFor(() => expect(screen.getByText("已安装 v0.1.0")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "安装" })).toBeNull();
    expect(screen.getByRole("button", { name: "详情" })).toBeTruthy();
  });

  it("shows upgrade button when a newer version exists", async () => {
    seedPlugins([
      { manifest: { id: "com.dsh-tauri.panel", name: "DSH Tauri Panel", version: "0.0.9" } as never },
    ]);
    serviceMock("marketUpgrades").mockResolvedValue([registryEntry]);
    render(<PluginMarketPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "升级到 v0.1.0" })).toBeTruthy(),
    );
  });

  it("community tab searches github and installs from repo", async () => {
    serviceMock("marketSearch").mockResolvedValue([
      {
        fullName: "some-dev/dsh-awesome-plugin",
        description: "A community plugin",
        stars: 42,
        url: "https://github.com/some-dev/dsh-awesome-plugin",
      },
    ]);
    serviceMock("marketInstall").mockResolvedValue({
      manifest: {
        id: "com.community.awesome",
        name: "Awesome",
        version: "0.1.0",
        description: "",
        author: "",
        entry: "index.html",
        permissions: [],
        contributes: { sidebar: [], panel: [], command: [], setting: [] },
      },
      dir: "",
      enabled: true,
      builtin: false,
      error: null,
    } as PluginInfo);
    render(<PluginMarketPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "社区搜索" }));
    fireEvent.change(screen.getByPlaceholderText(/搜索 GitHub/), {
      target: { value: "awesome" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() =>
      expect(screen.getByText("some-dev/dsh-awesome-plugin")).toBeTruthy(),
    );
    expect(screen.getByText("★ 42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /安装（下载 zipball/ }));
    await waitFor(() =>
      expect(serviceMock("marketInstall")).toHaveBeenCalledWith(
        "some-dev/dsh-awesome-plugin",
        undefined,
      ),
    );
  });

  it("community search shows empty hint when nothing matched", async () => {
    serviceMock("marketSearch").mockResolvedValue([]);
    render(<PluginMarketPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "社区搜索" }));
    fireEvent.change(screen.getByPlaceholderText(/搜索 GitHub/), {
      target: { value: "nothing-here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() => expect(screen.getByText("没有匹配的仓库。")).toBeTruthy());
  });

  it("presets tab maps pluginId to installed plugin", async () => {
    seedPlugins([
      {
        manifest: {
          id: "com.dsh-tauri.notification",
          name: "dsh-tauri-notification",
          version: "0.1.0",
        } as never,
      },
    ]);
    render(<PluginMarketPage />);
    fireEvent.click(await screen.findByRole("tab", { name: "预设" }));
    await waitFor(() => expect(screen.getByText("已内置")).toBeTruthy());
    expect(screen.getByRole("button", { name: "详情" })).toBeTruthy();
  });
});

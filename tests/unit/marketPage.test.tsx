import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginStore } from "@/stores/pluginStore";
import type { MarketPlugin, MarketRegistry, PresetsFile } from "@/types/plugin";
import type { PluginInfo } from "@/types/plugin";

/** PluginMarketPage 行为测试：整模块 mock tauriService，走市场三标签页交互。 */

const marketOfficial = vi.fn<() => Promise<MarketRegistry>>();
const marketUpgrades = vi.fn<() => Promise<MarketPlugin[]>>();
const presetsGet = vi.fn<() => Promise<PresetsFile>>();
const pluginReadme = vi.fn<() => Promise<string>>();
const marketInstall = vi.fn<() => Promise<PluginInfo>>();

vi.mock("@/services/tauriService", () => ({
  marketOfficial: () => marketOfficial(),
  marketUpgrades: () => marketUpgrades(),
  presetsGet: () => presetsGet(),
  pluginReadme: () => pluginReadme(),
  marketInstall: () => marketInstall(),
}));

vi.mock("@/plugins/PluginHost", () => ({
  PluginHost: () => <div data-testid="plugin-host-stub" />,
}));

import PluginMarketPage from "@/pages/PluginMarketPage";

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
  usePluginStore.setState({
    plugins: list.map((p) => ({
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
    })) as PluginInfo[],
  });
}

describe("PluginMarketPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedPlugins([]);
    marketOfficial.mockResolvedValue({ updatedAt: "2026-08-30", plugins: [registryEntry] });
    marketUpgrades.mockResolvedValue([]);
    presetsGet.mockResolvedValue({
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
    marketUpgrades.mockResolvedValue([registryEntry]);
    render(<PluginMarketPage />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "升级到 v0.1.0" })).toBeTruthy(),
    );
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

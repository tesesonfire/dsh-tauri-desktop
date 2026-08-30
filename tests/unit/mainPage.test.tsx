import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MainPage from "@/pages/MainPage";
import { useDshStore } from "@/stores/dshStore";
import { usePluginStore } from "@/stores/pluginStore";
import type { PluginInfo } from "@/types/plugin";

/** MainPage 集成测试：核心过期横幅 + 右侧插件面板坞。
 *
 * tauriService 用自动 mock（任意导出都是 resolve(undefined) 的 vi.fn），
 * PluginHost 打桩避免 iframe/dshplugin 协议依赖。
 */

/** tauriService 自动 mock：显式列出全部导出（vitest mocker 需要静态可见的导出名），
 *  未在用例中显式设定行为的导出统一 resolve(undefined)；事件订阅类导出
 *  resolve 一个 no-op 取消函数以保证卸载清理安全。 */
const serviceMocks = vi.hoisted(() => {
  const listenerNames = new Set([
    "onDshLog",
    "onDshState",
    "onDownloadProgress",
    "onUpdateProgress",
    "onCoreOutdated",
  ]);
  const registry = new Map<string, ReturnType<typeof vi.fn>>();
  return {
    names: [
      "appReady", "appVersion", "quitApp", "openSecondaryWindow", "presetsGet",
      "dshStart", "dshStop", "dshRestart", "dshStatus", "dshEnvCheck",
      "coreListVersions", "coreInstalled", "coreCurrent", "coreInstall", "coreUse",
      "coreRemove", "profileList", "profileActive", "profileCreate", "profileDelete",
      "profileSwitch", "profileExport", "profileImport", "pluginList", "pluginInstall",
      "pluginUninstall", "pluginSetEnabled", "pluginSetConfig", "pluginGetConfig",
      "pluginReadme", "pluginManifest", "pluginStorageGet", "pluginStorageSet",
      "pluginStorageDelete", "pluginBridgeCall", "marketOfficial", "marketSearch",
      "marketInstall", "marketUpgrades", "downloadFile", "downloadCancel",
      "cliInstallShim", "cliStatus", "updateCheck", "updateDownloadAndApply",
      "updateCurrentVersion", "updateRelaunch", "notify", "settingsGet", "settingsSave",
      "onDshLog", "onDshState", "onDownloadProgress", "onUpdateProgress", "onCoreOutdated",
    ],
    get(name: string): ReturnType<typeof vi.fn> {
      let fn = registry.get(name);
      if (fn === undefined) {
        fn = listenerNames.has(name)
          ? vi.fn(() => Promise.resolve(() => undefined))
          : vi.fn(() => Promise.resolve(undefined));
        registry.set(name, fn);
      }
      return fn;
    },
  };
});

vi.mock("@/services/tauriService", () => {
  const moduleObject: Record<string, unknown> = {};
  for (const name of serviceMocks.names) {
    moduleObject[name] = serviceMocks.get(name);
  }
  return moduleObject;
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
    // dshStatus 契约兜底：后端始终返回状态对象（refresh 会写入 store）
    serviceMocks.get("dshStatus").mockResolvedValue({
      state: "idle",
      pid: null,
      host: "127.0.0.1",
      port: 3080,
      profile: null,
      restarts: 0,
      lastError: null,
    });
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

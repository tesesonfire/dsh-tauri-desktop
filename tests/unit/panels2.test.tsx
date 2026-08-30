import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoreManagerPanel } from "@/components/CoreManagerPanel";
import { PluginList } from "@/components/PluginList";
import { UpdatePanel } from "@/components/UpdatePanel";
import { usePluginStore } from "@/stores/pluginStore";
import { useToastStore } from "@/stores/toastStore";
import { serviceMock } from "../helpers/mockTauriService";
import type { CoreVersion, InstalledCore } from "@/types/dsh";
import type { PluginInfo } from "@/types/plugin";

/** CoreManagerPanel / PluginList / UpdatePanel 测试（共享 mock 工厂）。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

const installed: InstalledCore[] = [
  { version: "0.1.0", dir: "D:/dsh/0.1.0", isCurrent: true, entry: "D:/dsh/0.1.0/bin/dsh.js" },
  { version: "0.1.1", dir: "D:/dsh/0.1.1", isCurrent: false, entry: "D:/dsh/0.1.1/bin/dsh.js" },
];
const remote: CoreVersion[] = [
  {
    version: "0.2.0",
    tag: "v0.2.0",
    publishedAt: "2026-08-30T00:00:00Z",
    notes: "new release",
    downloadUrl: "https://example.com/dsh.tgz",
  },
];

function makePlugin(id: string, name: string, overrides: Partial<PluginInfo> = {}): PluginInfo {
  return {
    manifest: {
      id,
      name,
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
    ...overrides,
  };
}

describe("CoreManagerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("coreInstalled").mockResolvedValue(installed);
    serviceMock("coreCurrent").mockResolvedValue("0.1.0");
    serviceMock("coreListVersions").mockResolvedValue(remote);
  });

  it("shows installed version, current marker and remote versions", async () => {
    render(<CoreManagerPanel />);
    await waitFor(() => expect(screen.getAllByText(/v0.1.0/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/当前/).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getAllByText(/v0.2.0/).length).toBeGreaterThan(0));
    expect(screen.getByRole("button", { name: /安装/ })).toBeTruthy();
  });

  it("switch and remove call backend and refresh local state", async () => {
    serviceMock("coreUse").mockResolvedValue(undefined);
    serviceMock("coreRemove").mockResolvedValue(undefined);
    render(<CoreManagerPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: /切换/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /切换/ }));
    await waitFor(() => expect(serviceMock("coreUse")).toHaveBeenCalledWith("0.1.1"));
    const removeButtons = screen.getAllByRole("button", { name: /删除/ });
    fireEvent.click(removeButtons[removeButtons.length - 1] as Element);
    await waitFor(() => expect(serviceMock("coreRemove")).toHaveBeenCalledWith("0.1.1"));
    // 操作后本地状态刷新
    await waitFor(() =>
      expect(serviceMock("coreInstalled").mock.calls.length).toBeGreaterThanOrEqual(2),
    );
  });

  it("install button installs the remote version", async () => {
    serviceMock("coreInstall").mockResolvedValue(undefined);
    render(<CoreManagerPanel />);
    await waitFor(() => expect(screen.getByRole("button", { name: /安装/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /安装/ }));
    await waitFor(() =>
      expect(serviceMock("coreInstall").mock.calls[0]?.[0]).toBe("0.2.0"),
    );
  });
});

describe("PluginList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePluginStore.setState({ plugins: [], loading: false, sidebarEntries: [] });
    serviceMock("pluginList").mockResolvedValue([]);
  });

  it("shows empty hint when no plugins installed", async () => {
    render(<PluginList />);
    await waitFor(() =>
      expect(screen.getByText(/尚未安装任何插件/)).toBeTruthy(),
    );
  });

  it("lists plugins with enable switch and uninstall button", async () => {
    serviceMock("pluginList").mockResolvedValue([
      makePlugin("com.a", "Alpha"),
      makePlugin("com.b", "Beta", { enabled: false }),
    ]);
    render(<PluginList />);
    await waitFor(() => expect(screen.getByText("Alpha")).toBeTruthy());
    expect(screen.getByText("Beta")).toBeTruthy();
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(switches[0]?.getAttribute("aria-checked")).toBe("true");
    expect(switches[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("toggling the switch disables the plugin", async () => {
    serviceMock("pluginList").mockResolvedValue([makePlugin("com.a", "Alpha")]);
    serviceMock("pluginSetEnabled").mockResolvedValue(undefined);
    render(<PluginList />);
    await waitFor(() => expect(screen.getByText("Alpha")).toBeTruthy());
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() =>
      expect(serviceMock("pluginSetEnabled")).toHaveBeenCalledWith("com.a", false),
    );
  });
});

describe("UpdatePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("updateCurrentVersion").mockResolvedValue("0.1.0");
    serviceMock("updateCheck").mockResolvedValue(null);
    serviceMock("updateDownloadAndApply").mockResolvedValue(undefined);
  });

  it("reports up-to-date when check returns null", async () => {
    render(<UpdatePanel />);
    fireEvent.click(screen.getByRole("button", { name: /检查更新/ }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.message.includes("最新版本"))).toBe(true),
    );
    expect(screen.getByText(/0\.1\.0/)).toBeTruthy();
  });

  it("shows release notes and enables download when update found", async () => {
    serviceMock("updateCheck").mockResolvedValue({
      version: "0.2.0",
      notes: "### 修复若干问题",
      downloadUrl: "https://example.com/app.exe",
      sha256: null,
      currentVersion: "0.1.0",
    });
    render(<UpdatePanel />);
    fireEvent.click(screen.getByRole("button", { name: /检查更新/ }));
    await waitFor(() => expect(screen.getByText(/修复若干问题/)).toBeTruthy());
    expect(screen.getAllByText(/0\.2\.0/).length).toBeGreaterThan(0);
  });
});

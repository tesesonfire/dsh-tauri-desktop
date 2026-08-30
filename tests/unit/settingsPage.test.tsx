import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "@/pages/SettingsPage";
import {
  serviceMock,
} from "../helpers/mockTauriService";
import type { AppSettings } from "@/types/tauri";

/** SettingsPage 测试：四标签页切换 + 保存链路（共享 tauriService mock 工厂）。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

vi.mock("@/plugins/PluginHost", () => ({
  PluginHost: () => <div data-testid="host-stub" />,
}));

const DEFAULT_SETTINGS: AppSettings = {
  onboarded: true,
  activeProfile: "",
  general: { theme: "system", language: "zh-CN", launchBehavior: "normal" },
  dsh: {
    nodePath: "",
    port: 3080,
    autoStart: true,
    defaultProfile: "",
  },
  advanced: {
    devMode: false,
    logLevel: "info",
    proxy: "",
    experimental: false,
    execAllowlist: ["git", "node"],
    fsAllowlist: [],
  },
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("settingsGet").mockResolvedValue(structuredClone(DEFAULT_SETTINGS));
    serviceMock("appVersion").mockResolvedValue("0.1.0");
    serviceMock("profileList").mockResolvedValue([]);
    serviceMock("profileActive").mockResolvedValue("");
    serviceMock("settingsSave").mockResolvedValue(undefined);
    serviceMock("pluginList").mockResolvedValue([]);
    serviceMock("coreInstalled").mockResolvedValue([]);
    serviceMock("coreListVersions").mockResolvedValue([]);
    serviceMock("coreCurrent").mockResolvedValue(null);
    serviceMock("cliStatus").mockResolvedValue({
      installed: false, shimPath: null, binDirInPath: false, message: "",
    });
    serviceMock("cliInstallShim").mockResolvedValue({
      installed: true, shimPath: "x", binDirInPath: true, message: "ok",
    });
    serviceMock("updateCheck").mockResolvedValue(null);
  });

  it("renders loading state before settings arrive, then general tab with version", async () => {
    const { container } = render(<SettingsPage />);
    expect(container.textContent).toContain("加载设置");
    await waitFor(() => expect(container.textContent).toContain("外观"));
    expect(container.textContent).toContain("dsh-tauri-desktop v0.1.0");
    expect(screen.getByRole("tab", { name: "通用" }).getAttribute("aria-selected")).toBe("true");
  });

  it("saves settings when the theme select changes on the general tab", async () => {
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(container.textContent).toContain("外观"));
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0] as HTMLSelectElement, { target: { value: "dark" } });
    await waitFor(() => expect(serviceMock("settingsSave")).toHaveBeenCalledTimes(1));
    const saved = (serviceMock("settingsSave").mock.calls[0]?.[0] ?? null) as AppSettings | null;
    expect(saved?.general.theme).toBe("dark");
  });

  it("dsh tab edits port and persists via save", async () => {
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(container.textContent).toContain("外观"));
    fireEvent.click(screen.getByRole("tab", { name: "dsh 配置" }));
    await waitFor(() => expect(container.textContent).toContain("dsh 配置"));
    // 端口输入（number input）修改后触发保存
    const portInput = screen.getByDisplayValue("3080") as HTMLInputElement;
    fireEvent.change(portInput, { target: { value: "4000" } });
    await waitFor(() => expect(serviceMock("settingsSave")).toHaveBeenCalledTimes(1));
    const saved = (serviceMock("settingsSave").mock.calls[0]?.[0] ?? null) as AppSettings | null;
    expect(saved?.dsh.port).toBe(4000);
  });

  it("advanced tab shows allowlist content", async () => {
    const { container } = render(<SettingsPage />);
    await waitFor(() => expect(container.textContent).toContain("外观"));
    fireEvent.click(screen.getByRole("tab", { name: "高级" }));
    await waitFor(() => expect(container.textContent).toContain("exec"));
    expect(container.textContent).toContain("git");
  });
});

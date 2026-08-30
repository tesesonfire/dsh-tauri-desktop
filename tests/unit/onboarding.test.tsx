import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OnboardingPage from "@/pages/OnboardingPage";
import {
  serviceMock,
} from "../helpers/mockTauriService";
import type { PresetsFile } from "@/types/plugin";
import type { AppSettings } from "@/types/tauri";
import type { EnvCheckResult } from "@/types/dsh";

/** OnboardingPage 四步向导测试（共享 tauriService mock 工厂）。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

const PRESETS: PresetsFile = {
  version: 1,
  updatedAt: "2026-08-31",
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
    {
      id: "dsh-market",
      name: "DSH Market",
      description: "插件市场",
      icon: "store",
      category: "market",
      source: "builtin",
      recommended: false,
      permissions: ["ui"],
      pluginId: null,
    },
  ],
};

const SETTINGS: AppSettings = {
  onboarded: false,
  activeProfile: "",
  general: { theme: "system", language: "zh-CN", launchBehavior: "normal" },
  dsh: { nodePath: "", port: 3080, autoStart: true, defaultProfile: "" },
  advanced: {
    devMode: false,
    logLevel: "info",
    proxy: "",
    experimental: false,
    execAllowlist: ["git"],
    fsAllowlist: [],
  },
};

const ENV: EnvCheckResult = {
  nodeOk: true,
  nodeVersion: "v22.3.0",
  nodePath: "node",
  dshInstalled: false,
  dshVersion: null,
  dshEntry: null,
  message: "环境就绪",
};

async function goToStep(index: number): Promise<void> {
  for (let i = 0; i < index; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  }
}

describe("OnboardingPage", () => {
  const onDone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("presetsGet").mockResolvedValue(structuredClone(PRESETS));
    serviceMock("settingsGet").mockResolvedValue(structuredClone(SETTINGS));
    serviceMock("dshEnvCheck").mockResolvedValue(ENV);
    serviceMock("settingsSave").mockResolvedValue(undefined);
    serviceMock("profileCreate").mockResolvedValue({
      id: "default",
      name: "default",
      dshHome: "x",
      defaultPort: 3080,
      createdAt: "",
      extra: {},
    });
    onDone.mockClear();
  });

  it("shows welcome text and environment badges on step 0", async () => {
    render(<OnboardingPage onDone={onDone} />);
    expect(screen.getByText("欢迎使用 dsh-tauri-desktop")).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/Node v22.3.0/)).toBeTruthy(),
    );
    expect(screen.getByText(/dsh 未安装/)).toBeTruthy();
  });

  it("preselects recommended presets and allows toggling", async () => {
    render(<OnboardingPage onDone={onDone} />);
    // 预设列表在步骤 1 才渲染；先进入步骤 1，再等异步 presets 到达
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await screen.findByText("DSH Notification");
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(switches[0]?.getAttribute("aria-checked")).toBe("true");
    expect(switches[1]?.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(switches[0] as Element);
    expect(switches[0]?.getAttribute("aria-checked")).toBe("false");
  });

  it("optional CLI registration button updates its label after install", async () => {
    serviceMock("cliInstallShim").mockResolvedValue({
      installed: true,
      shimPath: "C:\\bin\\dsh.cmd",
      binDirInPath: true,
      message: "注册成功",
    });
    render(<OnboardingPage onDone={onDone} />);
    await goToStep(2);
    const cliButton = screen.getByRole("button", { name: /注册 dsh 命令行工具/ });
    fireEvent.click(cliButton);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "已注册 dsh 命令" })).toBeTruthy(),
    );
  });

  it("finish creates profile, saves onboarded settings and calls onDone", async () => {
    render(<OnboardingPage onDone={onDone} />);
    await goToStep(3);
    fireEvent.click(screen.getByRole("button", { name: "进入应用" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(serviceMock("profileCreate")).toHaveBeenCalledWith("default", 3080);
    const saveCall = serviceMock("settingsSave").mock.calls[0]?.[0] as AppSettings;
    expect(saveCall.onboarded).toBe(true);
    expect(saveCall.dsh.port).toBe(3080);
    expect(saveCall.dsh.defaultProfile).toBe("default");
    expect(saveCall.activeProfile).toBe("default");
  });

  it("summary step lists chosen profile, port and presets", async () => {
    render(<OnboardingPage onDone={onDone} />);
    // 等推荐预设装载完成（selected 状态由 presetsGet 结果填充）再走向导
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await screen.findByText("DSH Notification");
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    await waitFor(() => {
      const summary = screen.getByText("一切就绪").closest("div")?.parentElement
        ?.textContent;
      expect(summary).toContain("默认档案：default");
      expect(summary).toContain("dsh 端口：3080");
      expect(summary).toContain("DSH Notification");
    });
  });
});

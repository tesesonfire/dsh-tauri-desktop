import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import {
  serviceMock,
  stubEmptyBackendContracts,
} from "../helpers/mockTauriService";
import type { AppSettings } from "@/types/tauri";

/** App 根组件路由测试：引导判定 / 浏览器降级 / 启动窗口行为。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

const maximize = vi.fn(() => Promise.resolve());
const isMaximized = vi.fn(() => Promise.resolve(false));
const minimize = vi.fn(() => Promise.resolve());
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    maximize,
    minimize,
    isMaximized,
    onResized: () => Promise.resolve(() => undefined),
    listen: () => Promise.resolve(() => undefined),
  }),
}));

function settingsWith(onboarded: boolean, launchBehavior: AppSettings["general"]["launchBehavior"]): AppSettings {
  return {
    onboarded,
    activeProfile: "",
    general: { theme: "system", language: "zh-CN", launchBehavior },
    dsh: { nodePath: "", port: 3080, autoStart: false, defaultProfile: "" },
    advanced: {
      devMode: false,
      logLevel: "info",
      proxy: "",
      experimental: false,
      execAllowlist: [],
      fsAllowlist: [],
    },
  };
}

function tauriEnv(): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function browserEnv(): void {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

async function renderApp(): Promise<void> {
  render(<App />);
  await waitFor(() => {
    const ready =
      screen.queryByText("欢迎使用 dsh-tauri-desktop") !== null ||
      document.querySelector('nav[aria-label="主导航"]') !== null;
    expect(ready).toBe(true);
  });
}

describe("App routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserEnv();
    stubEmptyBackendContracts();
    serviceMock("settingsGet").mockResolvedValue(settingsWith(true, "normal"));
  });

  afterEach(() => {
    browserEnv();
  });

  it("browser dev environment skips onboarding and renders main page", async () => {
    await renderApp();
    expect(serviceMock("settingsGet")).not.toHaveBeenCalled();
    expect(document.querySelector('nav[aria-label="主导航"]')).toBeTruthy();
  });

  it("tauri env with onboarded=false shows the onboarding wizard", async () => {
    tauriEnv();
    serviceMock("settingsGet").mockResolvedValue(settingsWith(false, "normal"));
    await renderApp();
    expect(screen.getByText("欢迎使用 dsh-tauri-desktop")).toBeTruthy();
  });

  it("tauri env with onboarded=true goes straight to the main page", async () => {
    tauriEnv();
    await renderApp();
    expect(screen.queryByText("欢迎使用 dsh-tauri-desktop")).toBeNull();
    expect(document.querySelector('nav[aria-label="主导航"]')).toBeTruthy();
    expect(serviceMock("appReady")).toHaveBeenCalledTimes(1);
  });

  it("settingsGet failure falls back to the main page (no onboarding loop)", async () => {
    tauriEnv();
    serviceMock("settingsGet").mockRejectedValue(new Error("[settings_get] boom"));
    await renderApp();
    expect(screen.queryByText("欢迎使用 dsh-tauri-desktop")).toBeNull();
    expect(document.querySelector('nav[aria-label="主导航"]')).toBeTruthy();
  });

  it("launchBehavior maximized maximizes the window on boot", async () => {
    tauriEnv();
    serviceMock("settingsGet").mockResolvedValue(settingsWith(true, "maximized"));
    await renderApp();
    await waitFor(() => expect(maximize).toHaveBeenCalledTimes(1));
    expect(minimize).not.toHaveBeenCalled();
  });
});

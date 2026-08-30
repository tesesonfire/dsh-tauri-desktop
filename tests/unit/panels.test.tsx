import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliPanel } from "@/components/CliPanel";
import { Sidebar } from "@/components/Sidebar";
import { useDshStore } from "@/stores/dshStore";
import { useProfileStore } from "@/stores/profileStore";
import {
  serviceMock,
} from "../helpers/mockTauriService";
import type { ActivityItem } from "@/components/ActivityBar";
import type { DshStatus, Profile } from "@/types/dsh";

/** CliPanel 与 Sidebar 组件测试（共享 tauriService mock 工厂）。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

const RUNNING_STATUS: DshStatus = {
  state: "running",
  pid: 4321,
  host: "127.0.0.1",
  port: 3080,
  profile: "default",
  restarts: 0,
  lastError: null,
  startedAt: null,
};

describe("CliPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows registered state and shim path from backend", async () => {
    serviceMock("cliStatus").mockResolvedValue({ installed: true, shimPath: "C:\\bin\\dsh.cmd" });
    render(<CliPanel />);
    await waitFor(() => expect(screen.getByText("已注册")).toBeTruthy());
    expect(screen.getByText(/dsh\.cmd/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "注册 dsh 命令" })).toBeTruthy();
  });

  it("shows unregistered state then updates after install", async () => {
    serviceMock("cliStatus").mockResolvedValue({ installed: false, shimPath: null });
    serviceMock("cliInstallShim").mockResolvedValue({
      installed: true,
      shimPath: "C:\\bin\\dsh.cmd",
      message: "注册成功",
    });
    render(<CliPanel />);
    await waitFor(() => expect(screen.getByText("未注册")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "注册 dsh 命令" }));
    await waitFor(() => expect(screen.getByText("已注册")).toBeTruthy());
    expect(serviceMock("cliInstallShim")).toHaveBeenCalledTimes(1);
  });
});

const ITEMS: ActivityItem[] = [
  { id: "dsh", label: "dsh", icon: "play" },
  { id: "settings", label: "设置", icon: "settings" },
];

function seedStatus(status: DshStatus | null): void {
  useDshStore.setState({ status, loading: false });
}

describe("Sidebar dsh section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStatus(null);
    useProfileStore.setState({ profiles: [], activeId: "" });
  });

  it("shows start button when idle and stop/restart when running", () => {
    const { rerender } = render(<Sidebar activity="dsh" items={ITEMS} />);
    expect(screen.getByRole("button", { name: /启动/ })).toBeTruthy();

    seedStatus(RUNNING_STATUS);
    rerender(<Sidebar activity="dsh" items={ITEMS} />);
    expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /重启/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /启动/ })).toBeNull();
  });

  it("renders status metadata and error block", () => {
    seedStatus({
      ...RUNNING_STATUS,
      lastError: "boom",
      restarts: 2,
    });
    render(<Sidebar activity="dsh" items={ITEMS} />);
    expect(screen.getByText("127.0.0.1:3080")).toBeTruthy();
    expect(screen.getByText("4321")).toBeTruthy();
    expect(screen.getByText("2 次")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("start/stop buttons invoke store actions", () => {
    const start = vi.fn();
    useDshStore.setState({ start, status: null });
    render(<Sidebar activity="dsh" items={ITEMS} />);
    fireEvent.click(screen.getByRole("button", { name: /启动/ }));
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("Sidebar workspaces section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStatus(null);
  });

  it("lists profiles, marks active and switches on click", () => {
    const profiles: Profile[] = [
      { id: "p1", name: "default", dshHome: "a", defaultPort: 3080, createdAt: "", extra: {} },
      { id: "p2", name: "dev", dshHome: "b", defaultPort: 3081, createdAt: "", extra: {} },
    ];
    const switchTo = vi.fn();
    useProfileStore.setState({ profiles, activeId: "p2", switchTo });
    render(<Sidebar activity="workspaces" items={ITEMS} />);
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("当前")).toBeTruthy();
    fireEvent.click(screen.getByText("default"));
    expect(switchTo).toHaveBeenCalledWith("p1");
  });
});

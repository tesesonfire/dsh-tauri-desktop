import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/Sidebar";
import { DshLogs } from "@/components/DshLogs";
import { useDshStore } from "@/stores/dshStore";
import { serviceMock } from "../helpers/mockTauriService";
import type { DshStatus } from "@/types/dsh";

/**
 * e2e 场景 3-lite（前端联动部分，见 tests/e2e/README.md）：
 * dsh 停止/重启 → 状态徽章、启动按钮组与日志面板随同一 store 联动。
 * 场景 2（进程真实启动 → 心跳）需真实进程编排，仍归 WebDriver 路线。
 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

const ITEMS = [{ id: "dsh", label: "dsh", icon: "play" } as const];

function status(state: DshStatus["state"], restarts = 0): DshStatus {
  return {
    state,
    pid: state === "running" ? 1234 : null,
    host: "127.0.0.1",
    port: 3080,
    profile: "default",
    restarts,
    lastError: null,
    startedAt: null,
  };
}

function seed(logs: { level: DshStatus["state"] | "info" | "warn" | "error" | "success"; line: string }[]): void {
  useDshStore.setState({
    logs: logs.map((l, i) => ({
      level: l.level as never,
      line: l.line,
      ts: new Date(Date.UTC(2026, 7, 31, 2, 0, i)).toISOString(),
    })),
  });
}

describe("scenario 3-lite: state badge, action buttons and log panel move together", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("dshStatus").mockResolvedValue(status("idle"));
    serviceMock("pluginList").mockResolvedValue([]);
    serviceMock("profileList").mockResolvedValue([]);
    useDshStore.setState({ status: null, logs: [], connect: "idle" as never, loading: false });
  });

  it("running state: badge turns success, stop/restart shown, ready log visible", () => {
    useDshStore.setState({ status: status("running"), connect: "connected" as never });
    seed([{ level: "success", line: "WebUI listening on 3080" }]);
    render(
      <>
        <Sidebar activity="dsh" items={ITEMS} />
        <DshLogs actions={true} />
      </>,
    );
    expect(screen.getByText("运行中")).toBeTruthy();
    expect(screen.getByRole("button", { name: /停止/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /启动/ })).toBeNull();
    expect(screen.getByText(/listening on 3080/)).toBeTruthy();
  });

  it("stopped state: badge stops, start returns, error logs filterable", () => {
    useDshStore.setState({ status: status("stopped"), connect: "stopped" as never });
    seed([
      { level: "error", line: "ECONNREFUSED" },
      { level: "info", line: "process exited" },
    ]);
    render(
      <>
        <Sidebar activity="dsh" items={ITEMS} />
        <DshLogs actions={true} />
      </>,
    );
    expect(screen.getByText("已停止")).toBeTruthy();
    expect(screen.getByRole("button", { name: /启动/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /停止/ })).toBeNull();
    // 日志面板默认显示全部；error 过滤后只剩错误行
    expect(screen.getByText(/process exited/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText(/ECONNREFUSED/)).toBeTruthy();
    expect(screen.queryByText(/process exited/)).toBeNull();
  });

  it("crash loop shows restart counter badge and warn logs", () => {
    useDshStore.setState({ status: status("crashed", 3), connect: "disconnected" as never });
    seed([{ level: "warn", line: "auto restart #3 in 8s" }]);
    render(
      <>
        <Sidebar activity="dsh" items={ITEMS} />
        <DshLogs actions={true} />
      </>,
    );
    expect(screen.getByText("已崩溃")).toBeTruthy();
    expect(screen.getByText("3 次")).toBeTruthy();
    expect(screen.getByText(/auto restart #3/)).toBeTruthy();
  });
});

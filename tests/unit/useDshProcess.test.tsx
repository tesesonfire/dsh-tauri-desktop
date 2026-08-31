import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDshProcess } from "@/hooks/useDshProcess";
import { useDshStore } from "@/stores/dshStore";
import { serviceMock } from "../helpers/mockTauriService";

/** useDshProcess hook 测试：挂载订阅/刷新副作用与 start/stop/restart 委托。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule: b } = await import("../helpers/mockTauriService");
  return b();
});

const okStatus = {
  state: "idle",
  pid: null,
  host: "127.0.0.1",
  port: 3080,
  profile: null,
  restarts: 0,
  lastError: null,
  startedAt: null,
};

describe("useDshProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("dshStatus").mockResolvedValue(okStatus);
    serviceMock("dshStart").mockResolvedValue(okStatus);
    serviceMock("dshStop").mockResolvedValue({ ...okStatus, state: "stopped" });
    serviceMock("dshRestart").mockResolvedValue({ ...okStatus, state: "starting" });
    useDshStore.setState({
      status: null,
      error: null,
      loading: false,
      connect: "idle" as never,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes to events and refreshes status on mount", async () => {
    renderHook(() => useDshProcess());
    await waitFor(() => {
      expect(serviceMock("onDshLog")).toHaveBeenCalled();
      expect(serviceMock("onDshState")).toHaveBeenCalled();
      expect(serviceMock("dshStatus")).toHaveBeenCalled();
    });
  });

  it("returned start delegates to the store action", async () => {
    const startSpy = vi.spyOn(useDshStore.getState(), "start");
    const { result } = renderHook(() => useDshProcess());
    await result.current.start();
    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  it("returned stop and restart delegate to the store actions", async () => {
    const stopSpy = vi.spyOn(useDshStore.getState(), "stop");
    const restartSpy = vi.spyOn(useDshStore.getState(), "restart");
    const { result } = renderHook(() => useDshProcess());
    await result.current.stop();
    await result.current.restart();
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(restartSpy).toHaveBeenCalledTimes(1);
    stopSpy.mockRestore();
    restartSpy.mockRestore();
  });
});

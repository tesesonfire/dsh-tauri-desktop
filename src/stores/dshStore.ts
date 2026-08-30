import { create } from "zustand";
import type { DshConnectState, DshStatus, LogLine } from "@/types/dsh";
import { dshRestart, dshStart, dshStop, dshStatus, onDshLog, onDshState } from "@/services/tauriService";
import type { StartOptions } from "@/types/dsh";

/** 日志环形缓冲上限 */
const MAX_LOG_LINES = 500;

interface DshState {
  status: DshStatus | null;
  logs: LogLine[];
  connect: DshConnectState;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  start: (options?: StartOptions) => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  appendLog: (line: LogLine) => void;
  clearLogs: () => void;
  setConnect: (state: DshConnectState) => void;
  setError: (error: string | null) => void;
  subscribeEvents: () => Promise<() => void>;
}

export const useDshStore = create<DshState>((set, get) => ({
  status: null,
  logs: [],
  connect: "loading",
  loading: false,
  error: null,

  refresh: async () => {
    try {
      const status = await dshStatus();
      set({ status });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  start: async (options) => {
    set({ loading: true, error: null });
    try {
      const status = await dshStart(options);
      set({ status });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  stop: async () => {
    set({ loading: true });
    try {
      const status = await dshStop();
      set({ status, connect: "stopped" });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  restart: async () => {
    set({ loading: true });
    try {
      const status = await dshRestart();
      set({ status, connect: "loading" });
    } catch (err) {
      set({ error: String(err) });
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  appendLog: (line) => {
    const logs = [...get().logs, line];
    if (logs.length > MAX_LOG_LINES) {
      logs.splice(0, logs.length - MAX_LOG_LINES);
    }
    set({ logs });
  },

  clearLogs: () => set({ logs: [] }),

  setConnect: (connect) => set({ connect }),

  setError: (error) => set({ error }),

  /** 订阅后端事件（日志 + 状态）。返回取消订阅函数。 */
  subscribeEvents: async () => {
    const unlisteners: (() => void)[] = [];
    unlisteners.push(await onDshLog((line) => get().appendLog(line)));
    unlisteners.push(
      await onDshState((status) => {
        set({ status });
        if (status.state === "running") {
          set({ connect: "loading" }); // 等心跳确认
        } else if (status.state === "stopped" || status.state === "idle") {
          set({ connect: "stopped" });
        } else if (status.state === "error" || status.state === "crashed") {
          set({ connect: "disconnected" });
        }
      }),
    );
    return () => unlisteners.forEach((fn) => fn());
  },
}));

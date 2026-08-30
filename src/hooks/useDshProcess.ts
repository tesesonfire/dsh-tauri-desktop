import { useEffect } from "react";
import { useDshStore } from "@/stores/dshStore";
import { isTauriEnvironment, pingDsh, retryDelayMs } from "@/services/dshService";

/**
 * dsh 进程状态管理 Hook：
 * - 订阅后端事件（dsh://log、dsh://state）
 * - 心跳检测：每 5s ping dsh WebUI，连续失败 3 次判定断开
 * - 提供 start/stop/restart 快捷操作
 */
export function useDshProcess(): {
  start: (options?: Parameters<ReturnType<typeof useDshStore.getState>["start"]>[0]) => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
} {
  const subscribeEvents = useDshStore((s) => s.subscribeEvents);
  const refresh = useDshStore((s) => s.refresh);
  const setConnect = useDshStore((s) => s.setConnect);
  const store = useDshStore;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void subscribeEvents().then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    void refresh();

    // 心跳：仅 Tauri 环境下启用
    let failCount = 0;
    let attempt = 0;
    let timer: number | undefined;
    const beat = (): void => {
      const status = store.getState().status;
      const state = status?.state ?? "idle";
      if (!isTauriEnvironment() || state !== "running") {
        timer = window.setTimeout(beat, 5000);
        return;
      }
      void pingDsh(status?.host ?? "127.0.0.1", status?.port ?? 3080).then((ok) => {
        if (ok) {
          failCount = 0;
          attempt = 0;
          setConnect("connected");
        } else {
          failCount += 1;
          if (failCount >= 3) {
            setConnect("disconnected");
          }
        }
        timer = window.setTimeout(beat, ok ? 5000 : retryDelayMs(attempt++));
      });
    };
    timer = window.setTimeout(beat, 2000);

    return () => {
      cancelled = true;
      unlisten?.();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [subscribeEvents, refresh, setConnect, store]);

  return {
    start: async (options) => {
      await store.getState().start(options);
    },
    stop: async () => {
      await store.getState().stop();
    },
    restart: async () => {
      await store.getState().restart();
    },
  };
}

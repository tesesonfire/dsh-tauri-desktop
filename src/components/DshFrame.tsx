import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DshLogs } from "@/components/DshLogs";
import { useDshStore } from "@/stores/dshStore";
import { dshWebUrl } from "@/services/dshService";

/**
 * dsh WebUI iframe 容器：
 * - loading 骨架 / 连接失败重试 / 心跳断连提示
 * - 服务未启动时展示启动按钮与日志输出
 */
export function DshFrame(): React.ReactElement {
  const status = useDshStore((s) => s.status);
  const connect = useDshStore((s) => s.connect);
  const start = useDshStore((s) => s.start);
  const loading = useDshStore((s) => s.loading);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const url = useMemo(
    () => dshWebUrl(status?.host ?? "127.0.0.1", status?.port ?? 3080),
    [status?.host, status?.port],
  );

  const running = status?.state === "running" && connect !== "stopped";
  const showOverlay = !running;

  const overlayContent = (): React.ReactNode => {
    if (connect === "loading" || status?.state === "starting") {
      return (
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">正在连接 dsh 服务 ({url})…</p>
        </div>
      );
    }
    if (connect === "stopped" || status === null || ["idle", "stopped"].includes(status.state)) {
      return (
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium">dsh 服务未启动</p>
          <p className="text-xs text-muted-foreground">
            启动后将在 {url} 加载 dsh Web UI。首次启动需要 Node.js 运行时与 dsh 核心。
          </p>
          <Button onClick={() => void start()} disabled={loading}>
            {loading ? "启动中…" : "启动 dsh"}
          </Button>
          <DshLogs className="mt-2 max-h-56 w-[520px] text-left" />
        </div>
      );
    }
    // disconnected / error / crashed
    return (
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <p className="text-sm font-medium text-destructive">无法连接 dsh 服务</p>
        <p className="text-xs text-muted-foreground">
          {status?.lastError ?? `对 ${url} 的连接失败（心跳超时或进程退出）。`}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => setReloadKey((k) => k + 1)}>重试连接</Button>
          <Button variant="outline" onClick={() => void useDshStore.getState().restart()} disabled={loading}>
            重启服务
          </Button>
        </div>
        <DshLogs className="mt-2 max-h-56 w-[520px] text-left" />
      </div>
    );
  };

  return (
    <div className="relative h-full w-full bg-background">
      {running && (
        <iframe
          key={reloadKey}
          ref={iframeRef}
          title="dsh Web UI"
          src={url}
          onLoad={() => {
            if (useDshStore.getState().status?.state === "running") {
              useDshStore.getState().setConnect("connected");
            }
          }}
          className="h-full w-full border-0"
        />
      )}
      {showOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/95">
          {overlayContent()}
        </div>
      )}
    </div>
  );
}

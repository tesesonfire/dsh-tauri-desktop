import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useOnMount, useTauriCommand } from "@/hooks/useTauriCommand";
import { toast } from "@/stores/toastStore";
import {
  coreCurrent,
  coreInstalled,
  coreInstall,
  coreListVersions,
  coreRemove,
  coreUse,
} from "@/services/tauriService";
import type { CoreVersion, InstalledCore } from "@/types/dsh";

/**
 * dsh 核心多版本管理面板：
 * 本地已安装版本（切换/删除）+ 远端版本（GitHub Releases 安装，进度经 download 事件）。
 */
export function CoreManagerPanel(): React.ReactElement {
  const [installed, setInstalled] = useState<InstalledCore[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [remote, setRemote] = useState<CoreVersion[] | null>(null);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);

  const installedCmd = useTauriCommand(coreInstalled, { silent: true });
  const currentCmd = useTauriCommand(coreCurrent, { silent: true });
  const remoteCmd = useTauriCommand(coreListVersions, { silent: true });

  const refreshLocal = async (): Promise<void> => {
    const list = await installedCmd.run();
    const cur = await currentCmd.run();
    setInstalled(list ?? []);
    setCurrent(cur);
  };

  useOnMount(() => {
    void refreshLocal();
    void remoteCmd.run().then((list) => setRemote(list));
  });

  const action = async (version: string, run: () => Promise<unknown>, okMessage: string): Promise<void> => {
    setBusyVersion(version);
    try {
      await run();
      toast.success(okMessage);
      await refreshLocal();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusyVersion(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          dsh 核心版本
          {current !== null && current !== "" && <Badge>当前 v{current}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {installed.length === 0 && (
          <p className="text-xs text-muted-foreground">
            本地未安装任何 dsh 核心。可从下方远端版本安装，或使用 npm 全局安装
            （<code className="font-mono">npm i -g @deepseek-ai/dsh</code>）。
          </p>
        )}
        {installed.map((item) => (
          <div key={item.version} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <span className="font-medium">v{item.version}</span>
              {item.isCurrent && <Badge className="ml-2">当前</Badge>}
              {item.entry !== null && (
                <p className="truncate font-mono text-xs text-muted-foreground">{item.entry}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              {!item.isCurrent && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyVersion !== null}
                  onClick={() => {
                    void action(item.version, () => coreUse(item.version), `已切换到 v${item.version}`);
                  }}
                >
                  切换
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={busyVersion !== null || item.isCurrent}
                onClick={() => {
                  void action(item.version, () => coreRemove(item.version), `已删除 v${item.version}`);
                }}
              >
                删除
              </Button>
            </div>
          </div>
        ))}

        <div className="mt-1 border-t pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              远端版本（GitHub Releases）
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={remoteCmd.loading}
              onClick={() => {
                void remoteCmd.run().then((list) => setRemote(list));
              }}
            >
              {remoteCmd.loading ? "加载中…" : "刷新"}
            </Button>
          </div>
          {remote === null && (
            <p className="text-xs text-muted-foreground">
              {remoteCmd.error ?? "尚未加载远端列表（需要访问 api.github.com）"}
            </p>
          )}
          {(remote ?? []).slice(0, 8).map((version) => {
            const installedVersion = installed.some((i) => i.version === version.version);
            return (
              <div key={version.tag} className="flex items-center justify-between gap-3 py-1 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">v{version.version}</span>
                  {version.publishedAt !== null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(version.publishedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  disabled={busyVersion !== null || installedVersion}
                  onClick={() => {
                    void action(
                      version.version,
                      () => coreInstall(version.version, version.downloadUrl ?? undefined),
                      `v${version.version} 安装完成（下载进度见事件流）`,
                    );
                  }}
                >
                  {installedVersion ? "已安装" : busyVersion === version.version ? "安装中…" : "安装"}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

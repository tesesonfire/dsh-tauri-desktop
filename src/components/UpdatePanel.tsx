import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Markdown } from "@/components/Markdown";
import { toast } from "@/stores/toastStore";
import {
  updateCheck,
  updateCurrentVersion,
  updateDownloadAndApply,
  updateRelaunch,
} from "@/services/tauriService";
import type { UpdateInfo } from "@/types/tauri";

/** 自更新面板：检查更新、进度、更新日志（Markdown 渲染）、重启 */
export function UpdatePanel(): React.ReactElement {
  const [current, setCurrent] = useState<string>("…");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);
  const [readyRestart, setReadyRestart] = useState<boolean>(false);

  const check = async (): Promise<void> => {
    setChecking(true);
    try {
      setCurrent(await updateCurrentVersion());
      const found = await updateCheck();
      setInfo(found);
      if (found === null) toast.success("当前已是最新版本");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setChecking(false);
    }
  };

  const apply = async (): Promise<void> => {
    setDownloading(true);
    try {
      await updateDownloadAndApply();
      setReadyRestart(true);
      toast.success("更新完成，请重启应用");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          应用更新
          <Badge variant="muted">v{current}</Badge>
          {info !== null && <Badge variant="success">可更新到 v{info.version}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
            {checking ? "检查中…" : "检查更新"}
          </Button>
          {info !== null && !readyRestart && (
            <Button size="sm" onClick={() => void apply()} disabled={downloading}>
              {downloading ? "下载并应用中…" : `更新到 v${info.version}`}
            </Button>
          )}
          {readyRestart && (
            <Button size="sm" onClick={() => void updateRelaunch().catch((err: unknown) => toast.error(String(err)))}>
              立即重启
            </Button>
          )}
        </div>
        {info !== null && info.notes !== null && (
          <div className="max-h-56 overflow-y-auto rounded-md border p-3">
            <Markdown content={info.notes} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

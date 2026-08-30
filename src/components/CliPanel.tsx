import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/stores/toastStore";
import { cliInstallShim, cliStatus } from "@/services/tauriService";
import type { CliStatus as CliStatusType } from "@/types/tauri";

/** CLI 注册面板：安装 dsh 命令 shim 到系统 PATH */
export function CliPanel(): React.ReactElement {
  const [status, setStatus] = useState<CliStatusType | null>(null);
  const [installing, setInstalling] = useState<boolean>(false);

  useEffect(() => {
    void cliStatus()
      .then(setStatus)
      .catch((err: unknown) => toast.error(String(err)));
  }, []);

  const install = async (): Promise<void> => {
    setInstalling(true);
    try {
      const next = await cliInstallShim();
      setStatus(next);
      toast.success(next.message);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          命令行集成
          {status?.installed === true ? (
            <Badge variant="success">已注册</Badge>
          ) : (
            <Badge variant="muted">未注册</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          安装后可在任意终端使用 <code className="font-mono">dsh</code> 命令（支持 --profile / --host /
          --port / --version / --help，参数转发到 dsh 核心）。PATH 修改只做追加，不覆盖已有配置。
        </p>
        {status?.shimPath !== null && status?.shimPath !== undefined && (
          <p className="font-mono text-xs text-muted-foreground">shim: {status.shimPath}</p>
        )}
        <div>
          <Button size="sm" onClick={() => void install()} disabled={installing}>
            {installing ? "安装中…" : "注册 dsh 命令"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

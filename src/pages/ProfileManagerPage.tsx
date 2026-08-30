import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { useProfileStore } from "@/stores/profileStore";
import { useOnMount, useTauriCommand } from "@/hooks/useTauriCommand";
import { toast } from "@/stores/toastStore";
import { dshStart, profileExport, profileImport } from "@/services/tauriService";
import type { Profile } from "@/types/dsh";

/** 档案管理页：创建/删除/切换/导入/导出/一键启动 */
export default function ProfileManagerPage(): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const activeId = useProfileStore((s) => s.activeId);
  const refresh = useProfileStore((s) => s.refresh);
  const create = useProfileStore((s) => s.create);
  const remove = useProfileStore((s) => s.remove);
  const switchTo = useProfileStore((s) => s.switchTo);
  const [newName, setNewName] = useState<string>("");
  const [newPort, setNewPort] = useState<string>("3080");
  const startCmd = useTauriCommand(dshStart, { silent: false });

  useOnMount(() => {
    void refresh();
  });

  const onCreate = async (): Promise<void> => {
    const port = Number(newPort) || 3080;
    try {
      await create(newName.trim(), port);
      toast.success(`档案 ${newName.trim()} 已创建`);
      setNewName("");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const onExport = async (profile: Profile): Promise<void> => {
    try {
      const dest = `${profile.id}.profile.json`;
      await profileExport(profile.id, dest);
      toast.success(`已导出到 ${dest}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const onImport = async (): Promise<void> => {
    try {
      const src = window.prompt("输入要导入的 profile.json 路径：");
      if (src === null || src.trim() === "") return;
      await profileImport(src.trim());
      await refresh();
      toast.success("档案已导入");
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-lg font-semibold">档案管理</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          每个档案是隔离的 dsh 配置环境（独立 DSH_HOME），支持创建、切换、导入/导出。
        </p>

        <Card className="mb-4">
          <CardContent className="flex items-center gap-2 py-3">
            <Input
              className="flex-1"
              placeholder="档案名（字母数字 . _ -）"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              className="w-24"
              type="number"
              placeholder="端口"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
            />
            <Button onClick={() => void onCreate()} disabled={newName.trim() === ""}>
              创建
            </Button>
            <Button variant="outline" onClick={() => void onImport()}>
              导入
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          {profiles.map((profile) => (
            <Card key={profile.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{profile.name}</span>
                    {activeId === profile.id && <Badge>当前</Badge>}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">
                    DSH_HOME: {profile.dshHome} · 端口 {profile.defaultPort} · 创建于{" "}
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {activeId !== profile.id && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void switchTo(profile.id)
                          .then(() => toast.success(`已切换到 ${profile.name}`))
                          .catch((err: unknown) => toast.error(String(err)));
                      }}
                    >
                      切换
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void startCmd
                        .run({ profile: profile.id, port: profile.defaultPort })
                        .then(() => toast.success("dsh 启动中，可在主界面查看日志"));
                    }}
                  >
                    启动
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onExport(profile)}>
                    导出
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`确认删除档案 ${profile.name}？（隔离数据将一并删除）`)) {
                        void remove(profile.id)
                          .then(() => toast.success("档案已删除"))
                          .catch((err: unknown) => toast.error(String(err)));
                      }
                    }}
                  >
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {profiles.length === 0 && (
            <p className="text-sm text-muted-foreground">尚未创建档案。</p>
          )}
        </div>
      </div>
    </div>
  );
}

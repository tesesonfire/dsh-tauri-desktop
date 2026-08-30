import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/Icon";
import { useDshStore } from "@/stores/dshStore";
import { useProfileStore } from "@/stores/profileStore";
import { cn } from "@/utils/cn";
import type { DshState } from "@/types/dsh";
import type { ActivityItem } from "@/components/ActivityBar";

export interface SidebarProps {
  /** 当前激活的 Activity（决定内容） */
  activity: string;
  items: ActivityItem[];
  /** 插件入口切换回调（由 MainPage 提供，用于导航到插件面板） */
  onOpenPlugin?: (activityId: string) => void;
}

function stateBadgeVariant(state: DshState | undefined): "success" | "warn" | "destructive" | "muted" {
  switch (state) {
    case "running":
      return "success";
    case "starting":
    case "stopping":
    case "crashed":
      return "warn";
    case "error":
      return "destructive";
    default:
      return "muted";
  }
}

const STATE_LABEL: Record<DshState, string> = {
  idle: "未启动",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  stopped: "已停止",
  crashed: "已崩溃",
  error: "错误",
};

/** 左侧 Sidebar：随 ActivityBar 切换内容 */
export function Sidebar(props: SidebarProps): React.ReactElement {
  const status = useDshStore((s) => s.status);
  const start = useDshStore((s) => s.start);
  const stop = useDshStore((s) => s.stop);
  const restart = useDshStore((s) => s.restart);
  const loading = useDshStore((s) => s.loading);
  const profiles = useProfileStore((s) => s.profiles);
  const activeId = useProfileStore((s) => s.activeId);
  const switchTo = useProfileStore((s) => s.switchTo);

  const pluginItem = props.items.find(
    (item) => item.id === props.activity && item.pluginId !== undefined,
  );

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r bg-sidebar">
      {props.activity === "dsh" && (
        <section className="flex flex-col gap-3 p-3">
          <header className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              dsh 服务
            </h2>
            <Badge variant={stateBadgeVariant(status?.state)}>
              {status ? STATE_LABEL[status.state] : "未知"}
            </Badge>
          </header>
          <div className="flex flex-wrap gap-1.5">
            {status?.state !== "running" && status?.state !== "starting" && (
              <Button size="sm" onClick={() => void start()} disabled={loading}>
                <Icon name="play" size={13} /> 启动
              </Button>
            )}
            {status?.state === "running" && (
              <>
                <Button size="sm" variant="secondary" onClick={() => void stop()} disabled={loading}>
                  <Icon name="stop" size={13} /> 停止
                </Button>
                <Button size="sm" variant="outline" onClick={() => void restart()} disabled={loading}>
                  <Icon name="refresh" size={13} /> 重启
                </Button>
              </>
            )}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>地址</dt>
            <dd className="text-foreground">
              {status ? `${status.host}:${status.port}` : "-"}
            </dd>
            <dt>PID</dt>
            <dd className="text-foreground">{status?.pid ?? "-"}</dd>
            <dt>档案</dt>
            <dd className="text-foreground">{status?.profile || "默认"}</dd>
            <dt>自动重启</dt>
            <dd className="text-foreground">{status?.restarts ?? 0} 次</dd>
          </dl>
          {status?.lastError && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {status.lastError}
            </p>
          )}
        </section>
      )}

      {props.activity === "workspaces" && (
        <section className="flex flex-col gap-2 p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            档案（Profile）
          </h2>
          {profiles.length === 0 && (
            <p className="text-xs text-muted-foreground">
              暂无档案。可在「设置 → dsh 配置」或档案管理页创建。
            </p>
          )}
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => void switchTo(profile.id)}
              className={cn(
                "flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                activeId === profile.id && "bg-accent",
              )}
            >
              <span className="truncate">{profile.name}</span>
              {activeId === profile.id && <Badge>当前</Badge>}
            </button>
          ))}
        </section>
      )}

      {props.activity === "plugins" && (
        <section className="p-3 text-sm text-muted-foreground">
          <p>在插件市场中浏览、搜索并一键安装社区插件。</p>
        </section>
      )}

      {props.activity === "settings" && (
        <section className="p-3 text-sm text-muted-foreground">
          <p>主题、语言、dsh 配置、插件管理与高级选项。</p>
        </section>
      )}

      {pluginItem && (
        <section className="flex flex-col p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {pluginItem.label}
          </h2>
          <p className="text-xs text-muted-foreground">插件面板已就绪。</p>
        </section>
      )}
    </aside>
  );
}

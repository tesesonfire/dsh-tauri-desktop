import { useState } from "react";
import { ActivityBar, useActivityItems } from "@/components/ActivityBar";
import { Sidebar } from "@/components/Sidebar";
import { DshFrame } from "@/components/DshFrame";
import { DshLogs } from "@/components/DshLogs";
import { PluginHost } from "@/plugins/PluginHost";
import { usePluginStore } from "@/stores/pluginStore";
import { useDshProcess } from "@/hooks/useDshProcess";
import { useProfileStore } from "@/stores/profileStore";

/**
 * 主界面布局：
 * 左侧 ActivityBar → 中间 Sidebar → 右侧主内容区（dsh iframe / 插件面板）。
 */
export default function MainPage(): React.ReactElement {
  const [activity, setActive] = useState<string>("dsh");
  const items = useActivityItems();
  useDshProcess();

  const activePlugin = usePluginStore((s) =>
    s.plugins.find((p) => activity.startsWith(`${p.manifest.id}:`)),
  );

  const showIframe = activity === "dsh" || activity === "plugins" || activity === "settings";

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ActivityBar active={activity} onChange={setActive} />
      <Sidebar activity={activity} items={items} />
      <main className="relative flex min-w-0 flex-1 flex-col">
        {showIframe && <DshFrame />}
        {activePlugin && <PluginHost plugin={activePlugin} className="flex-1" />}
        {activity === "workspaces" && <WorkspacePanel />}
        {activity === "dsh" && (
          <div className="h-48 shrink-0 border-t">
            <DshLogs className="h-full w-full rounded-none border-0" />
          </div>
        )}
      </main>
    </div>
  );
}

/** 工作区/档案面板 */
function WorkspacePanel(): React.ReactElement {
  const profiles = useProfileStore((s) => s.profiles);
  const activeId = useProfileStore((s) => s.activeId);
  const switchTo = useProfileStore((s) => s.switchTo);
  const create = useProfileStore((s) => s.create);
  const remove = useProfileStore((s) => s.remove);
  const [newName, setNewName] = useState<string>("");

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h1 className="mb-1 text-lg font-semibold">工作区 / 会话</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        档案提供完全隔离的 dsh 配置环境；会话由 dsh Web UI 管理，此处管理档案。
      </p>
      <div className="mb-4 flex max-w-md gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新档案名称（字母数字 . _ -）"
          className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <button
          type="button"
          className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
          onClick={() => {
            if (newName.trim()) {
              void create(newName.trim()).then(() => setNewName(""));
            }
          }}
        >
          创建
        </button>
      </div>
      <div className="grid max-w-2xl gap-2">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className="flex items-center justify-between rounded-md border bg-card p-3"
          >
            <div>
              <p className="text-sm font-medium">{profile.name}</p>
              <p className="text-xs text-muted-foreground">
                DSH_HOME: {profile.dshHome} · 端口 {profile.defaultPort}
              </p>
            </div>
            <div className="flex gap-2">
              {activeId === profile.id ? (
                <span className="text-xs text-primary">当前档案</span>
              ) : (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => void switchTo(profile.id)}
                >
                  切换
                </button>
              )}
              <button
                type="button"
                className="text-xs text-destructive hover:underline"
                onClick={() => void remove(profile.id)}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {profiles.length === 0 && (
          <p className="text-sm text-muted-foreground">尚未创建档案。</p>
        )}
      </div>
    </div>
  );
}

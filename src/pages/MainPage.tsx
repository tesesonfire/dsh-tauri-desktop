import { useState } from "react";
import { ActivityBar, useActivityItems } from "@/components/ActivityBar";
import { Sidebar } from "@/components/Sidebar";
import { DshFrame } from "@/components/DshFrame";
import { DshLogs } from "@/components/DshLogs";
import { PluginHost } from "@/plugins/PluginHost";
import PluginMarketPage from "@/pages/PluginMarketPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfileManagerPage from "@/pages/ProfileManagerPage";
import { usePluginStore } from "@/stores/pluginStore";
import { useDshStore } from "@/stores/dshStore";
import { useDshProcess } from "@/hooks/useDshProcess";

/**
 * 主界面布局：
 * 左侧 ActivityBar → 中间 Sidebar → 右侧主内容区（可选最右插件面板坞）。
 * 主内容区按活动切换：dsh WebUI iframe / 插件市场 / 档案管理 / 设置 / 插件面板。
 * 插件通过 ui.registerPanel 注册的面板聚合在右侧「面板坞」（Better Sidebar 形态）。
 */
export default function MainPage(): React.ReactElement {
  const [activity, setActive] = useState<string>("dsh");
  const items = useActivityItems();
  useDshProcess();

  const panels = usePluginStore((s) => s.panels);
  const allPlugins = usePluginStore((s) => s.plugins);
  const coreOutdated = useDshStore((s) => s.coreOutdated);
  const [rightPanelKey, setRightPanelKey] = useState<string | null>(null);

  const activePlugin = usePluginStore((s) =>
    s.plugins.find((p) => activity.startsWith(`${p.manifest.id}:`)),
  );

  const activePanel =
    panels.find((p) => `${p.pluginId}::${p.panelId}` === rightPanelKey) ?? panels[0];
  const activePanelPlugin =
    activePanel !== undefined
      ? allPlugins.find((p) => p.manifest.id === activePanel.pluginId && p.enabled)
      : undefined;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ActivityBar active={activity} onChange={setActive} />
      <Sidebar activity={activity} items={items} />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {coreOutdated !== null && (
          <div className="flex shrink-0 items-center gap-2 border-b bg-[#f59e0b]/10 px-4 py-1.5 text-xs text-brand-warning">
            <span>
              dsh 核心有新版本：v{coreOutdated.current} → v{coreOutdated.latest}，
              可在「设置 → dsh 核心管理」中更新（离线时已保留本地版本）
            </span>
          </div>
        )}
        {activity === "dsh" && (
          <>
            <DshFrame />
            <div className="h-48 shrink-0 border-t">
              <DshLogs className="h-full w-full rounded-none border-0" collapsible={true} />
            </div>
          </>
        )}
        {activity === "plugins" && <PluginMarketPage />}
        {activity === "workspaces" && <ProfileManagerPage />}
        {activity === "settings" && <SettingsPage />}
        {activePlugin && <PluginHost plugin={activePlugin} className="flex-1" />}
      </main>
      {activity === "dsh" && panels.length > 0 && (
        <aside className="flex w-72 shrink-0 flex-col border-l" data-testid="plugin-dock">
          <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b px-2">
            {panels.map((panel) => (
              <button
                key={`${panel.pluginId}::${panel.panelId}`}
                type="button"
                onClick={() => setRightPanelKey(`${panel.pluginId}::${panel.panelId}`)}
                className={
                  activePanel !== undefined &&
                  activePanel.pluginId === panel.pluginId &&
                  activePanel.panelId === panel.panelId
                    ? "rounded px-2 py-1 text-xs font-medium text-primary"
                    : "rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {panel.title}
              </button>
            ))}
          </div>
          {activePanelPlugin !== undefined && activePanel !== undefined && (
            <PluginHost
              plugin={activePanelPlugin}
              className="min-h-0 flex-1"
              key={activePanel.pluginId}
            />
          )}
        </aside>
      )}
    </div>
  );
}

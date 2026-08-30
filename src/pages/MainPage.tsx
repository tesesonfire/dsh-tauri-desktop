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
import { useDshProcess } from "@/hooks/useDshProcess";

/**
 * 主界面布局：
 * 左侧 ActivityBar → 中间 Sidebar → 右侧主内容区。
 * 主内容区按活动切换：dsh WebUI iframe / 插件市场 / 档案管理 / 设置 / 插件面板。
 */
export default function MainPage(): React.ReactElement {
  const [activity, setActive] = useState<string>("dsh");
  const items = useActivityItems();
  useDshProcess();

  const activePlugin = usePluginStore((s) =>
    s.plugins.find((p) => activity.startsWith(`${p.manifest.id}:`)),
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ActivityBar active={activity} onChange={setActive} />
      <Sidebar activity={activity} items={items} />
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
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
    </div>
  );
}

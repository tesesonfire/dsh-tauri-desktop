import { Icon, isIconName, type IconName } from "@/components/Icon";
import { cn } from "@/utils/cn";
import { usePluginStore } from "@/stores/pluginStore";

export interface ActivityItem {
  id: string;
  label: string;
  icon: IconName;
  /** 插件提供的入口（点击后 Sidebar 渲染 PluginHost） */
  pluginId?: string;
}

/** 固定入口 + 插件贡献入口聚合 */
export function useActivityItems(): ActivityItem[] {
  const sidebarEntries = usePluginStore((s) => s.sidebarEntries);
  const fixed: ActivityItem[] = [
    { id: "dsh", label: "dsh WebUI", icon: "terminal" },
    { id: "workspaces", label: "工作区 / 会话", icon: "folder" },
    { id: "plugins", label: "插件市场", icon: "store" },
    { id: "settings", label: "设置", icon: "settings" },
  ];
  const fromPlugins: ActivityItem[] = sidebarEntries.map((entry) => ({
    id: entry.id,
    label: entry.title,
    icon: isIconName(entry.icon) ? entry.icon : "puzzle",
    pluginId: entry.id.split(":")[0],
  }));
  return [...fixed, ...fromPlugins];
}

export interface ActivityBarProps {
  active: string;
  onChange: (id: string) => void;
}

/** 左侧 Activity Bar（类 VSCode） */
export function ActivityBar(props: ActivityBarProps): React.ReactElement {
  const items = useActivityItems();
  return (
    <nav
      aria-label="主导航"
      className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-2"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.label}
          aria-label={item.label}
          onClick={() => props.onChange(item.id)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md transition-colors",
            props.active === item.id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon name={item.icon} />
        </button>
      ))}
    </nav>
  );
}

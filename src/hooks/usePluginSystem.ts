import { useEffect } from "react";
import { usePluginStore } from "@/stores/pluginStore";
import { toast } from "@/stores/toastStore";

/**
 * 插件系统交互 Hook：刷新列表、启用/禁用/卸载（带 Toast 反馈）。
 */
export function usePluginSystem(): {
  refresh: () => Promise<void>;
  enable: (id: string, enabled: boolean) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
} {
  const refresh = usePluginStore((s) => s.refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    refresh,
    enable: async (id, enabled) => {
      try {
        await usePluginStore.getState().enable(id, enabled);
        toast.success(`插件已${enabled ? "启用" : "禁用"}`);
      } catch (err) {
        toast.error(String(err));
      }
    },
    uninstall: async (id) => {
      try {
        await usePluginStore.getState().uninstall(id);
        toast.success("插件已卸载");
      } catch (err) {
        toast.error(String(err));
      }
    },
  };
}

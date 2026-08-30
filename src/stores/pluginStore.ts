import { create } from "zustand";
import type { PanelRegistration, PluginInfo, SidebarEntry } from "@/types/plugin";
import {
  pluginList,
  pluginSetEnabled,
  pluginUninstall,
  pluginInstall,
} from "@/services/tauriService";

interface PluginState {
  plugins: PluginInfo[];
  loading: boolean;
  error: string | null;
  /** 插件注册的侧边栏入口（ActivityBar 渲染） */
  sidebarEntries: SidebarEntry[];
  /** 当前激活的插件侧边栏入口（非空时 Sidebar 显示插件面板） */
  activeSidebarId: string | null;
  refresh: () => Promise<void>;
  enable: (id: string, enabled: boolean) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  installFromPath: (path: string) => Promise<void>;
  registerSidebar: (entry: SidebarEntry) => void;
  unregisterSidebar: (pluginId: string) => void;
  setActiveSidebar: (id: string | null) => void;
  /** 面板注册表（面板协议插件维护） */
  panels: PanelRegistration[];
  registerPanel: (panel: PanelRegistration) => void;
}

/** 从启用的插件中聚合侧边栏入口 */
function collectSidebarEntries(plugins: PluginInfo[]): SidebarEntry[] {
  const entries: SidebarEntry[] = [];
  for (const plugin of plugins) {
    if (!plugin.enabled || plugin.error) continue;
    for (const entry of plugin.manifest.contributes.sidebar) {
      entries.push(entry);
    }
  }
  return entries;
}

export const usePluginStore = create<PluginState>((set, get) => ({
  plugins: [],
  loading: false,
  error: null,
  sidebarEntries: [],
  activeSidebarId: null,
  panels: [],

  refresh: async () => {
    set({ loading: true });
    try {
      const plugins = await pluginList();
      set({
        plugins,
        sidebarEntries: collectSidebarEntries(plugins),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    } finally {
      set({ loading: false });
    }
  },

  enable: async (id, enabled) => {
    await pluginSetEnabled(id, enabled);
    await get().refresh();
  },

  uninstall: async (id) => {
    await pluginUninstall(id);
    get().unregisterSidebar(id);
    await get().refresh();
  },

  installFromPath: async (path) => {
    await pluginInstall(path);
    await get().refresh();
  },

  registerSidebar: (entry) => {
    const entries = get().sidebarEntries.filter(
      (e) => !(e.id === entry.id),
    );
    entries.push(entry);
    set({ sidebarEntries: entries });
  },

  unregisterSidebar: (pluginId) => {
    // 入口 id 不含插件前缀，按注册时记录处理：由 Bridge 调用（带 pluginId 上下文）
    set({
      sidebarEntries: get().sidebarEntries.filter((e) => !e.id.startsWith(pluginId)),
      activeSidebarId:
        get().activeSidebarId?.startsWith(pluginId) === true ? null : get().activeSidebarId,
    });
  },

  setActiveSidebar: (id) => set({ activeSidebarId: id }),

  registerPanel: (panel) => {
    const panels = get().panels.filter(
      (p) => !(p.pluginId === panel.pluginId && p.panelId === panel.panelId),
    );
    panels.push(panel);
    set({ panels });
  },
}));

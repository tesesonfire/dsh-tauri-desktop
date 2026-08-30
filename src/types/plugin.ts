/** 插件系统类型：manifest、权限、contributes、桥接协议 */

export type PluginPermission =
  | "fs"
  | "exec"
  | "storage"
  | "git"
  | "network"
  | "ui"
  | "notification";

export interface SidebarEntry {
  id: string;
  title: string;
  icon: string;
}

export interface PanelEntry {
  id: string;
  title: string;
}

export interface CommandEntry {
  id: string;
  title: string;
}

export interface SettingEntry {
  key: string;
  type: "string" | "number" | "boolean" | "select";
  default?: unknown;
  options?: string[];
}

export interface ThemeContribution {
  cssVariables: Record<string, string>;
}

export interface Contributions {
  sidebar: SidebarEntry[];
  panel: PanelEntry[];
  command: CommandEntry[];
  setting: SettingEntry[];
  theme?: ThemeContribution;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  entry: string;
  permissions: PluginPermission[];
  contributes: Contributions;
}

export interface PluginInfo {
  manifest: PluginManifest;
  dir: string;
  enabled: boolean;
  builtin: boolean;
  error: string | null;
}

export interface PresetPlugin {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  source: string;
  recommended: boolean;
  permissions: PluginPermission[];
}

export interface PresetsFile {
  version: number;
  updatedAt: string;
  presets: PresetPlugin[];
}

/** ---------- postMessage 桥接协议（见 docs/ARCHITECTURE.md §6） ---------- */

export type BridgeMethod =
  | "fs.read"
  | "fs.write"
  | "exec.run"
  | "storage.get"
  | "storage.set"
  | "storage.delete"
  | "git.run"
  | "http.request"
  | "ui.registerSidebar"
  | "ui.registerPanel"
  | "ui.registerContextMenu"
  | "ui.showNotification"
  | "tauri.invoke"
  | "ping";

export interface BridgeMessage {
  /** 请求 id（响应回传同 id）；事件类消息为 evt:<uuid> */
  id: string;
  pluginId: string;
  type: "req" | "res" | "evt";
  method?: BridgeMethod;
  payload?: unknown;
  ok?: boolean;
  error?: string;
}

export interface PanelRegistration {
  pluginId: string;
  panelId: string;
  title: string;
}

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AppSettings,
  CliStatus,
  DownloadProgress,
  UnlistenFn,
  UpdateInfo,
  UpdateProgress,
} from "@/types/tauri";
import type {
  CoreVersion,
  DshStatus,
  EnvCheckResult,
  InstalledCore,
  LogLine,
  Profile,
} from "@/types/dsh";
import type { PluginInfo, PluginManifest, PresetsFile } from "@/types/plugin";
import type { StartOptions } from "@/types/dsh";

/**
 * Tauri 命令统一封装：所有 invoke 的单一入口。
 * 错误统一转为带上下文的 Error 抛出，由调用方（hooks/页面）捕获并 Toast。
 */

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    const message = typeof raw === "string" ? raw : JSON.stringify(raw);
    throw new Error(`[${command}] ${message}`, { cause: raw });
  }
}

/* ---------- 应用 ---------- */

export const appReady = (): Promise<void> => call<void>("app_ready");
export const appVersion = (): Promise<string> => call<string>("app_version");
export const quitApp = (): Promise<void> => call<void>("quit_app");
export const openSecondaryWindow = (
  label: string,
  title: string,
  url: string,
): Promise<void> => call<void>("open_secondary_window", { label, title, url });
export const presetsGet = (): Promise<PresetsFile> => call<PresetsFile>("presets_get");

/* ---------- 窗口 ---------- */
// 窗口控制直接使用 @tauri-apps/api/window（见 TitleBar），此处仅保留类型一致性说明。

/* ---------- dsh 工作流 ---------- */

export const dshStart = (options?: StartOptions): Promise<DshStatus> =>
  call<DshStatus>("dsh_start", { options: options ?? null });
export const dshStop = (): Promise<DshStatus> => call<DshStatus>("dsh_stop");
export const dshRestart = (): Promise<DshStatus> => call<DshStatus>("dsh_restart");
export const dshStatus = (): Promise<DshStatus> => call<DshStatus>("dsh_status");
export const dshEnvCheck = (): Promise<EnvCheckResult> =>
  call<EnvCheckResult>("dsh_env_check");

/* ---------- dsh 核心 ---------- */

export const coreListVersions = (): Promise<CoreVersion[]> =>
  call<CoreVersion[]>("core_list_versions");
export const coreInstalled = (): Promise<InstalledCore[]> =>
  call<InstalledCore[]>("core_installed");
export const coreCurrent = (): Promise<string | null> =>
  call<string | null>("core_current");
export const coreInstall = (version: string, url?: string): Promise<void> =>
  call<void>("core_install", { version, url: url ?? null });
export const coreUse = (version: string): Promise<void> =>
  call<void>("core_use", { version });
export const coreRemove = (version: string): Promise<void> =>
  call<void>("core_remove", { version });

/* ---------- 档案 ---------- */

export const profileList = (): Promise<Profile[]> => call<Profile[]>("profile_list");
export const profileActive = (): Promise<string> => call<string>("profile_active");
export const profileCreate = (name: string, port?: number): Promise<Profile> =>
  call<Profile>("profile_create", { name, port: port ?? null });
export const profileDelete = (name: string): Promise<void> =>
  call<void>("profile_delete", { name });
export const profileSwitch = (name: string): Promise<void> =>
  call<void>("profile_switch", { name });
export const profileExport = (name: string, dest: string): Promise<void> =>
  call<void>("profile_export", { name, dest });
export const profileImport = (src: string): Promise<Profile> =>
  call<Profile>("profile_import", { src });

/* ---------- 插件 ---------- */

export const pluginList = (): Promise<PluginInfo[]> => call<PluginInfo[]>("plugin_list");
export const pluginInstall = (path: string): Promise<PluginInfo> =>
  call<PluginInfo>("plugin_install", { path });
export const pluginUninstall = (id: string): Promise<void> =>
  call<void>("plugin_uninstall", { id });
export const pluginSetEnabled = (id: string, enabled: boolean): Promise<void> =>
  call<void>("plugin_set_enabled", { id, enabled });
export const pluginSetConfig = (id: string, config: unknown): Promise<void> =>
  call<void>("plugin_set_config", { id, config });
export const pluginGetConfig = (id: string): Promise<unknown> =>
  call<unknown>("plugin_get_config", { id });
export const pluginReadme = (id: string): Promise<string> =>
  call<string>("plugin_readme", { id });
export const pluginManifest = (id: string): Promise<PluginManifest> =>
  call<PluginManifest>("plugin_manifest", { id });
export const pluginStorageGet = (
  pluginId: string,
  key: string,
): Promise<string | null> =>
  call<string | null>("plugin_storage_get", { pluginId, key });
export const pluginStorageSet = (
  pluginId: string,
  key: string,
  value: string,
): Promise<void> => call<void>("plugin_storage_set", { pluginId, key, value });
export const pluginStorageDelete = (pluginId: string, key: string): Promise<boolean> =>
  call<boolean>("plugin_storage_delete", { pluginId, key });
export const pluginBridgeCall = (
  pluginId: string,
  method: string,
  params?: unknown,
): Promise<unknown> =>
  call<unknown>("plugin_bridge_call", {
    pluginId,
    method,
    params: params ?? null,
  });

/* ---------- 下载 ---------- */

export const downloadFile = (
  url: string,
  dest?: string,
): Promise<{ id: string }> =>
  call<{ id: string }>("download_file", { args: { url, dest: dest ?? null } });
export const downloadCancel = (id: string): Promise<boolean> =>
  call<boolean>("download_cancel", { id });

/* ---------- CLI ---------- */

export const cliInstallShim = (): Promise<CliStatus> =>
  call<CliStatus>("cli_install_shim");
export const cliStatus = (): Promise<CliStatus> => call<CliStatus>("cli_status");

/* ---------- 自更新 ---------- */

export const updateCheck = (): Promise<UpdateInfo | null> =>
  call<UpdateInfo | null>("update_check");
export const updateDownloadAndApply = (): Promise<void> =>
  call<void>("update_download_and_apply");
export const updateCurrentVersion = (): Promise<string> =>
  call<string>("update_current_version");
export const updateRelaunch = (): Promise<void> => call<void>("update_relaunch");

/* ---------- 通知 / 设置 ---------- */

export const notify = (title: string, body: string): Promise<void> =>
  call<void>("notify", { title, body });
export const settingsGet = (): Promise<AppSettings> => call<AppSettings>("settings_get");
export const settingsSave = (settings: AppSettings): Promise<void> =>
  call<void>("settings_save", { settings });

/* ---------- 事件订阅 ---------- */

export const onDshLog = async (callback: (line: LogLine) => void): Promise<UnlistenFn> =>
  listen<LogLine>("dsh://log", (event) => callback(event.payload));

export const onDshState = async (
  callback: (status: DshStatus) => void,
): Promise<UnlistenFn> => listen<DshStatus>("dsh://state", (event) => callback(event.payload));

export const onDownloadProgress = async (
  callback: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> =>
  listen<DownloadProgress>("download://progress", (event) => callback(event.payload));

export const onUpdateProgress = async (
  callback: (progress: UpdateProgress) => void,
): Promise<UnlistenFn> =>
  listen<UpdateProgress>("update://progress", (event) => callback(event.payload));

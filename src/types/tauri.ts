/** Tauri IPC 相关通用类型 */

export interface DownloadProgress {
  id: string;
  url: string;
  dest: string;
  downloaded: number;
  total: number | null;
  percent: number | null;
  speedBps: number;
  done: boolean;
  error: string | null;
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
  downloadUrl: string;
  sha256: string | null;
  currentVersion: string;
}

export interface UpdateProgress {
  stage: string;
  downloaded: number;
  total: number | null;
  percent: number | null;
  message: string | null;
}

export interface CliStatus {
  shimPath: string | null;
  binDirInPath: boolean;
  installed: boolean;
  message: string;
}

export type ThemeMode = "light" | "dark" | "system";

export interface GeneralConfig {
  theme: ThemeMode;
  language: string;
  launchBehavior: "normal" | "maximized" | "minimized";
}

export interface DshConfig {
  nodePath: string;
  port: number;
  autoStart: boolean;
  defaultProfile: string;
}

export interface AdvancedConfig {
  devMode: boolean;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  proxy: string;
  experimental: boolean;
  execAllowlist: string[];
  fsAllowlist: string[];
}

export interface AppSettings {
  onboarded: boolean;
  activeProfile: string;
  general: GeneralConfig;
  dsh: DshConfig;
  advanced: AdvancedConfig;
}

export type UnlistenFn = () => void;

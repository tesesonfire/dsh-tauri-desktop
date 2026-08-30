/** dsh 相关类型：进程状态、日志、环境、档案、核心版本 */

export type DshState =
  | "idle"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed"
  | "error";

export interface DshStatus {
  state: DshState;
  pid: number | null;
  port: number;
  host: string;
  profile: string | null;
  restarts: number;
  lastError: string | null;
  startedAt: string | null;
}

export interface LogLine {
  level: "info" | "warn" | "error" | "success";
  line: string;
  ts: string;
}

export interface EnvCheckResult {
  nodeOk: boolean;
  nodeVersion: string | null;
  nodePath: string | null;
  dshInstalled: boolean;
  dshVersion: string | null;
  dshEntry: string | null;
  message: string;
}

export interface Profile {
  id: string;
  name: string;
  dshHome: string;
  defaultPort: number;
  createdAt: string;
  extra: Record<string, unknown>;
}

export interface CoreVersion {
  version: string;
  tag: string;
  publishedAt: string | null;
  notes: string | null;
  downloadUrl: string | null;
}

export interface InstalledCore {
  version: string;
  dir: string;
  isCurrent: boolean;
  entry: string | null;
}

/** dsh WebUI 连接状态 */
export type DshConnectState = "loading" | "connected" | "disconnected" | "stopped";

/** dsh 启动参数 */
export interface StartOptions {
  profile?: string | null;
  host?: string | null;
  port?: number | null;
}

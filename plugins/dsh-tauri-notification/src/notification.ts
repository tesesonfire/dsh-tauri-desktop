// 通知规则：纯逻辑，便于测试（不依赖 DOM / 桥）。

/** dsh 生命周期状态（与宿主 dsh.state 事件对齐）。 */
export type DshState =
  | "idle"
  | "starting"
  | "running"
  | "stopped"
  | "crashed"
  | "error";

/** 用户可配置的通知开关。 */
export interface NotificationSettings {
  notifyOnReady: boolean;
  notifyOnCrash: boolean;
  notifyOnStop: boolean;
}

export const DEFAULT_SETTINGS: NotificationSettings = {
  notifyOnReady: true,
  notifyOnCrash: true,
  notifyOnStop: false,
};

/** 从存储原始值（可能为 null / 半残 JSON）归一化出完整设置。 */
export function normalizeSettings(raw: unknown): NotificationSettings {
  const source =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
  const read = (key: keyof NotificationSettings): boolean => {
    const value = source[key];
    if (typeof value === "string") return value === "true";
    return typeof value === "boolean" ? value : DEFAULT_SETTINGS[key];
  };
  return {
    notifyOnReady: read("notifyOnReady"),
    notifyOnCrash: read("notifyOnCrash"),
    notifyOnStop: read("notifyOnStop"),
  };
}

/** 状态迁移结果：是否应通知 + 通知标题/正文。 */
export interface NotificationDecision {
  notify: boolean;
  title: string;
  body: string;
}

/** 单个状态对应的通知文案（进入即发，不依赖前态）。 */
const STATE_TEXT: Record<DshState, { title: string; body: string } | null> = {
  idle: null,
  starting: null,
  running: { title: "dsh 已就绪", body: "WebUI 正在运行，可以开始会话。" },
  stopped: { title: "dsh 已停止", body: "进程已由用户手动停止。" },
  crashed: { title: "dsh 进程崩溃", body: "dsh 异常退出，宿主正在自动重启。" },
  error: { title: "dsh 启动失败", body: "请查看日志定位原因（已达重启上限或环境异常）。" },
};

/** 判定某次状态变化是否应发通知及文案。 */
export function decide(
  prevState: DshState | null,
  nextState: DshState,
  settings: NotificationSettings,
): NotificationDecision {
  const text = STATE_TEXT[nextState];
  if (text === null) {
    return { notify: false, title: "", body: "" };
  }
  const allowed =
    nextState === "running"
      ? settings.notifyOnReady
      : nextState === "crashed" || nextState === "error"
        ? settings.notifyOnCrash
        : settings.notifyOnStop;
  // 首次上报（prev 为 null）时忽略 stopped，避免启用插件即被打扰
  const firstReport = prevState === null;
  return { notify: allowed && !(firstReport && nextState === "stopped"), ...text };
}

/** 事件日志行（UI 展示用）。 */
export function formatLogLine(state: DshState, notified: boolean, at: number): string {
  const time = new Date(at).toLocaleTimeString();
  return `[${time}] ${state}${notified ? "（已通知）" : "（未通知）"}`;
}

/**
 * 主题管理逻辑（纯逻辑，jsdom 可测）：
 * - 读取/设置主题（light | dark | system）
 * - 监听宿主 theme.changed 事件
 * - CSS 变量注入（插件 theme.contributes + 用户覆盖）
 */

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** 解析 system 为具体主题 */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

/** 合并 CSS 变量：插件默认 < 用户覆盖 */
export function mergeCssVariables(
  pluginDefaults: Record<string, string>,
  userOverrides: Record<string, string>,
): Record<string, string> {
  return { ...pluginDefaults, ...userOverrides };
}

/** 把变量应用到元素（返回实际写入的条数，便于断言） */
export function applyCssVariables(
  element: { style: CSSStyleDeclaration } | { setProperty: (name: string, value: string) => void },
  variables: Record<string, string>,
): number {
  let count = 0;
  for (const [name, value] of Object.entries(variables)) {
    if (!name.startsWith("--")) continue;
    const target = element as { setProperty?: (n: string, v: string) => void; style?: CSSStyleDeclaration };
    if (typeof target.setProperty === "function") {
      target.setProperty(name, value);
    } else if (target.style !== undefined) {
      target.style.setProperty(name, value);
    }
    count += 1;
  }
  return count;
}

/** 主题状态机（UI 侧存储） */
export class ThemeManager {
  private mode: ThemeMode = "system";
  private listeners = new Set<(resolved: ResolvedTheme) => void>();

  getMode(): ThemeMode {
    return this.mode;
  }

  getResolved(prefersDark: boolean): ResolvedTheme {
    return resolveTheme(this.mode, prefersDark);
  }

  setMode(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
    this.mode = mode;
    const resolved = resolveTheme(mode, prefersDark);
    for (const listener of this.listeners) listener(resolved);
    return resolved;
  }

  /** 宿主 theme.changed 事件到达时调用 */
  onSystemChange(prefersDark: boolean): ResolvedTheme | null {
    if (this.mode !== "system") return null;
    return this.setMode("system", prefersDark);
  }

  subscribe(listener: (resolved: ResolvedTheme) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

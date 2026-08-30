import { useEffect } from "react";
import { useThemeStore } from "@/stores/themeStore";
import type { ThemeMode } from "@/types/tauri";

/** 主题管理 Hook：初始化 + 切换（同步到 localStorage 与 documentElement） */
export function useTheme(): {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  init: () => void;
} {
  const mode = useThemeStore((s) => s.mode);
  const resolved = useThemeStore((s) => s.resolved);
  const setMode = useThemeStore((s) => s.setMode);
  const init = useThemeStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return { mode, resolved, setMode, init };
}

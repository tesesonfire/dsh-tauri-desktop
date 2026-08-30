import { create } from "zustand";
import type { ThemeMode } from "@/types/tauri";

interface ThemeState {
  /** 用户选择：light | dark | system */
  mode: ThemeMode;
  /** 实际生效的主题（system 解析后） */
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  /** 初始化：读 localStorage + 监听系统主题变化 */
  init: () => void;
}

const STORAGE_KEY = "dsh-theme";

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return mode;
}

function applyToDocument(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // 供插件 iframe 通过自定义事件感知主题
  window.dispatchEvent(new CustomEvent("dsh-theme-changed", { detail: resolved }));
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "system",
  resolved: "light",
  setMode: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    const resolved = resolve(mode);
    applyToDocument(resolved);
    set({ mode, resolved });
  },
  init: () => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? "system";
    const resolved = resolve(stored);
    applyToDocument(resolved);
    set({ mode: stored, resolved });
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        if (get().mode === "system") {
          const next = resolve("system");
          applyToDocument(next);
          set({ resolved: next });
        }
      });
  },
}));

import { create } from "zustand";

/** 窗口状态：平台信息 + 最大化状态（TitleBar 共享） */
interface WindowState {
  platform: "macos" | "windows" | "linux" | "unknown";
  maximized: boolean;
  setPlatform: (platform: WindowState["platform"]) => void;
  setMaximized: (maximized: boolean) => void;
}

export const useWindowStore = create<WindowState>((set) => ({
  platform: "unknown",
  maximized: false,
  setPlatform: (platform) => set({ platform }),
  setMaximized: (maximized) => set({ maximized }),
}));

/** 由 userAgent 推断平台（macOS 交通灯在左，Windows/Linux 控制按钮在右） */
export function detectPlatform(): WindowState["platform"] {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Mac")) return "macos";
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Linux") || ua.includes("X11")) return "linux";
  return "unknown";
}

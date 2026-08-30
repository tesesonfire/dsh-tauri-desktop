import { create } from "zustand";

export interface ToastItem {
  id: string;
  kind: "success" | "error" | "info" | "warn";
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  push: (kind: ToastItem["kind"], message: string) => void;
  dismiss: (id: string) => void;
}

/** 全局 Toast 队列（所有异步操作的错误提示出口） */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    window.setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** 便捷 API：toast.success("...") 等 */
export const toast = {
  success: (message: string): void => useToastStore.getState().push("success", message),
  error: (message: string): void => useToastStore.getState().push("error", message),
  info: (message: string): void => useToastStore.getState().push("info", message),
  warn: (message: string): void => useToastStore.getState().push("warn", message),
};

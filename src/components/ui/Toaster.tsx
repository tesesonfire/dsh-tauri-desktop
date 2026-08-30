import { cn } from "@/utils/cn";
import { useToastStore } from "@/stores/toastStore";

/** 全局 Toast 渲染器（挂载在 App 根部） */
export function Toaster(): React.ReactElement {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          onClick={() => dismiss(item.id)}
          className={cn(
            "pointer-events-auto cursor-pointer rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur animate-in",
            item.kind === "success" && "border-brand-success/40 bg-card text-brand-success",
            item.kind === "error" && "border-destructive/40 bg-card text-destructive",
            item.kind === "warn" && "border-brand-warning/40 bg-card text-brand-warning",
            item.kind === "info" && "border-border bg-card text-foreground",
          )}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

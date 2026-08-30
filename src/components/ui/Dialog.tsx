import { useEffect } from "react";
import { cn } from "@/utils/cn";

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

/** 轻量模态框 */
export function Dialog(props: DialogProps): React.ReactElement | null {
  const { open, onClose } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={props.onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg rounded-lg border bg-background p-5 shadow-xl",
          props.className,
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{props.title}</h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="text-sm">{props.children}</div>
      </div>
    </div>
  );
}

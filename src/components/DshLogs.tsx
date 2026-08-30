import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/Icon";
import { useDshStore } from "@/stores/dshStore";
import { cn } from "@/utils/cn";

const LEVEL_CLASS: Record<string, string> = {
  info: "log-line-info",
  warn: "log-line-warn",
  error: "log-line-error",
  success: "log-line-success",
};

export interface DshLogsProps {
  className?: string;
  /** 显示操作按钮（清空） */
  actions?: boolean;
  /** 可折叠（收起时仅显示最后一行状态） */
  collapsible?: boolean;
  /** 折叠状态受控（可选） */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/** dsh 子进程实时日志（颜色高亮 + 自动滚动 + 可折叠） */
export function DshLogs(props: DshLogsProps): React.ReactElement {
  const logs = useDshStore((s) => s.logs);
  const clearLogs = useDshStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<boolean>(false);
  const collapsed = props.collapsed ?? uncontrolledCollapsed;

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [logs.length, collapsed]);

  const lastLine = logs[logs.length - 1];

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border bg-card",
        props.className,
      )}
    >
      <div className="flex items-center justify-between border-b px-2.5 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">dsh 日志</span>
        <div className="flex items-center gap-1">
          {props.actions !== false && !collapsed && (
            <Button variant="ghost" size="sm" onClick={clearLogs}>
              清空
            </Button>
          )}
          {props.collapsible === true && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={!collapsed}
              onClick={() => {
                const next = !collapsed;
                setUncontrolledCollapsed(next);
                props.onCollapsedChange?.(next);
              }}
            >
              <Icon name={collapsed ? "panel" : "x"} size={13} />
              {collapsed ? "展开" : "收起"}
            </Button>
          )}
        </div>
      </div>
      {collapsed ? (
        <div className="px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
          {lastLine !== undefined ? (
            <span className={cn("truncate", LEVEL_CLASS[lastLine.level])}>
              {lastLine.line}
            </span>
          ) : (
            "暂无日志输出"
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
          {logs.length === 0 && (
            <p className="text-muted-foreground">暂无日志输出</p>
          )}
          {logs.map((line, index) => (
            <div key={`${line.ts}-${index}`} className={cn("whitespace-pre-wrap break-all", LEVEL_CLASS[line.level])}>
              <span className="mr-2 select-none text-muted-foreground/60">
                {new Date(line.ts).toLocaleTimeString()}
              </span>
              {line.line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}

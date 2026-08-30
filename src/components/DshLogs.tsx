import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/Icon";
import { useDshStore } from "@/stores/dshStore";
import { cn } from "@/utils/cn";
import type { LogLine } from "@/types/dsh";

const LEVEL_CLASS: Record<string, string> = {
  info: "log-line-info",
  warn: "log-line-warn",
  error: "log-line-error",
  success: "log-line-success",
};

const LEVEL_FILTERS = ["all", "error", "warn", "success"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];

/** 按级别与关键字过滤日志行（纯逻辑，便于测试）。 */
export function filterLogLines(
  logs: LogLine[],
  level: LevelFilter,
  query: string,
): LogLine[] {
  const q = query.trim().toLowerCase();
  return logs.filter((line) => {
    if (level !== "all" && line.level !== level) return false;
    if (q !== "" && !line.line.toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface DshLogsProps {
  className?: string;
  /** 显示操作按钮（清空）与过滤工具栏 */
  actions?: boolean;
  /** 可折叠（收起时仅显示最后一行状态） */
  collapsible?: boolean;
  /** 折叠状态受控（可选） */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

/** dsh 子进程实时日志（颜色高亮 + 自动滚动 + 可折叠 + 级别/关键字过滤） */
export function DshLogs(props: DshLogsProps): React.ReactElement {
  const logs = useDshStore((s) => s.logs);
  const clearLogs = useDshStore((s) => s.clearLogs);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState<boolean>(false);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [query, setQuery] = useState<string>("");
  const collapsed = props.collapsed ?? uncontrolledCollapsed;

  useEffect(() => {
    if (!collapsed) {
      bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [logs.length, collapsed]);

  const filtered = useMemo(
    () => filterLogLines(logs, level, query),
    [logs, level, query],
  );

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
            <>
              <Input
                aria-label="搜索日志"
                placeholder="搜索日志…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-6 w-36 text-[11px]"
              />
              <div role="group" aria-label="日志级别过滤" className="flex">
                {LEVEL_FILTERS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={level === item}
                    onClick={() => setLevel(item)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px]",
                      level === item
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={clearLogs}>
                清空
              </Button>
            </>
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
          {filtered.length === 0 && (
            <p className="text-muted-foreground">暂无匹配日志</p>
          )}
          {filtered.map((line, index) => (
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

import { useState } from "react";
import { cn } from "@/utils/cn";

export interface TabItem {
  id: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/** 轻量标签页 */
export function Tabs(props: TabsProps): React.ReactElement {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 border-b border-border", props.className)}
    >
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={props.active === item.id}
          onClick={() => props.onChange(item.id)}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
            props.active === item.id
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** 受控Tabs的便捷 hook */
export function useTabs(initial: string): {
  active: string;
  setActive: (id: string) => void;
} {
  const [active, setActive] = useState<string>(initial);
  return { active, setActive };
}

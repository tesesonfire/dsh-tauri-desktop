/**
 * 动态上下文菜单注册表（纯逻辑，可测试）。
 * 支持的作用域：session（会话）/ workspace（工作区）/ content（正文）/
 * link（链接）/ input（输入框）。
 */

export type MenuScope = "session" | "workspace" | "content" | "link" | "input";

export interface MenuItemRegistration {
  id: string;
  scope: MenuScope;
  title: string;
  /** 触发时下发的命令 id（经宿主命令通道执行） */
  command?: string;
  /** 分隔线（显示在菜单项上方） */
  separator?: boolean;
}

export function isValidScope(scope: string): scope is MenuScope {
  return ["session", "workspace", "content", "link", "input"].includes(scope);
}

/** 菜单注册表 */
export class ContextMenuRegistry {
  private items = new Map<string, MenuItemRegistration>();

  register(item: MenuItemRegistration): MenuItemRegistration {
    if (!isValidScope(item.scope)) {
      throw new Error(`无效菜单作用域: ${item.scope}`);
    }
    if (item.title.trim() === "" && item.separator !== true) {
      throw new Error("菜单项标题不能为空");
    }
    this.items.set(item.id, item);
    return item;
  }

  unregister(id: string): boolean {
    return this.items.delete(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** 构建某作用域的渲染菜单（保持注册顺序，可按需过滤） */
  buildMenu(scope: MenuScope, filter?: (item: MenuItemRegistration) => boolean): MenuItemRegistration[] {
    return Array.from(this.items.values()).filter(
      (item) => item.scope === scope && (filter === undefined || filter(item)),
    );
  }

  all(): MenuItemRegistration[] {
    return Array.from(this.items.values());
  }
}

/** 默认菜单集（首次启动注册） */
export function defaultMenuItems(): MenuItemRegistration[] {
  return [
    { id: "session.archive", scope: "session", title: "归档会话", command: "session.archive" },
    { id: "session.copyTitle", scope: "session", title: "复制标题", command: "session.copyTitle" },
    { id: "session.sep", scope: "session", title: "", separator: true },
    { id: "workspace.openInWorktree", scope: "workspace", title: "在 Worktree 中打开", command: "workspace.openInWorktree" },
    { id: "content.copy", scope: "content", title: "复制所选", command: "content.copy" },
    { id: "content.quote", scope: "content", title: "引用到输入框", command: "content.quote" },
    { id: "link.copy", scope: "link", title: "复制链接", command: "link.copy" },
    { id: "input.pastePlain", scope: "input", title: "粘贴为纯文本", command: "input.pastePlain" },
  ];
}

/** 将 DOM 事件目标映射到菜单作用域 */
export function scopeFromTarget(target: {
  tagName?: string;
  closest?: (selector: string) => unknown;
  href?: string | null;
}): MenuScope {
  if (target.closest?.("[data-dsh-session]") !== undefined && target.closest !== undefined) {
    return "session";
  }
  if (target.closest?.("[data-dsh-workspace]") !== undefined && target.closest !== undefined) {
    return "workspace";
  }
  if (target.href !== undefined && target.href !== null && target.href !== "") {
    return "link";
  }
  const tag = (target.tagName ?? "").toLowerCase();
  if (tag === "input" || tag === "textarea" || target.closest?.("[contenteditable]") !== undefined) {
    return "input";
  }
  return "content";
}

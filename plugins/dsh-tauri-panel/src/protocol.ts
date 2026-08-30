/**
 * 面板协议（纯逻辑，可测试）：
 * - 面板注册（registerPanel）/ 激活（activatePanel）/ 关闭
 * - 面板间消息路由（panel.message）
 */

export interface PanelRecord {
  pluginId: string;
  panelId: string;
  title: string;
  registeredAt: number;
}

export interface PanelMessage {
  fromPanelId: string;
  toPanelId: string | null; // null = 广播
  payload: unknown;
  at: number;
}

/** 全局面板注册表 */
export class PanelRegistry {
  private panels = new Map<string, PanelRecord>();
  private activeId: string | null = null;
  private messages: PanelMessage[] = [];

  static key(pluginId: string, panelId: string): string {
    return `${pluginId}::${panelId}`;
  }

  register(pluginId: string, panelId: string, title: string, now = Date.now()): PanelRecord {
    const key = PanelRegistry.key(pluginId, panelId);
    const existing = this.panels.get(key);
    if (existing !== undefined) {
      existing.title = title; // 重复注册 = 更新
      return existing;
    }
    const record: PanelRecord = { pluginId, panelId, title, registeredAt: now };
    this.panels.set(key, record);
    if (this.activeId === null) this.activeId = key;
    return record;
  }

  unregister(pluginId: string, panelId: string): boolean {
    const key = PanelRegistry.key(pluginId, panelId);
    const removed = this.panels.delete(key);
    if (this.activeId === key) {
      this.activeId = this.panels.keys().next().value ?? null;
    }
    return removed;
  }

  activate(pluginId: string, panelId: string): PanelRecord | null {
    const key = PanelRegistry.key(pluginId, panelId);
    const panel = this.panels.get(key);
    if (panel === undefined) return null;
    this.activeId = key;
    return panel;
  }

  get active(): PanelRecord | null {
    return this.activeId === null ? null : this.panels.get(this.activeId) ?? null;
  }

  list(): PanelRecord[] {
    return Array.from(this.panels.values()).sort((a, b) => a.registeredAt - b.registeredAt);
  }

  /** 面板间消息：toPanelId 为 null 时广播给除发送者外的全部面板；返回该消息 */
  send(from: { pluginId: string; panelId: string }, toPanelId: string | null, payload: unknown, now = Date.now()): PanelMessage {
    const message: PanelMessage = {
      fromPanelId: PanelRegistry.key(from.pluginId, from.panelId),
      toPanelId,
      payload,
      at: now,
    };
    this.messages.push(message);
    if (this.messages.length > 200) this.messages.shift();
    return message;
  }

  /** 返回某条消息应送达的面板 key 列表 */
  route(message: PanelMessage): string[] {
    if (message.toPanelId !== null) {
      return this.panels.has(message.toPanelId) ? [message.toPanelId] : [];
    }
    return Array.from(this.panels.keys()).filter((key) => key !== message.fromPanelId);
  }

  /** 读取送达给某面板的消息（激活时回放） */
  inbox(pluginId: string, panelId: string): PanelMessage[] {
    const key = PanelRegistry.key(pluginId, panelId);
    return this.messages.filter((m) => m.toPanelId === key || (m.toPanelId === null && m.fromPanelId !== key));
  }
}

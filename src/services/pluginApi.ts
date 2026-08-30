import type { BridgeMessage, BridgeMethod } from "@/types/plugin";

/** 插件 UI 资源自定义协议 URL（跨平台差异由 Rust 端归一化，此处按平台拼接）。 */
export function pluginAssetUrl(pluginId: string, entry: string): string {
  const path = `${pluginId}/${entry.startsWith("/") ? entry.slice(1) : entry}`;
  if (isWindows()) {
    return `http://dshplugin.localhost/${path}`;
  }
  return `dshplugin://${path}`;
}

export function isWindows(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");
}

/** 生成桥接消息唯一 id。 */
export function newBridgeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** 校验消息是否为合法的桥接请求。 */
export function isBridgeRequest(data: unknown): data is BridgeMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const msg = data as Partial<BridgeMessage>;
  return (
    typeof msg.id === "string" &&
    typeof msg.pluginId === "string" &&
    msg.type === "req" &&
    typeof msg.method === "string"
  );
}

/**
 * manifest 校验器（前端侧）：
 * 与 Rust 端 models::plugin::Manifest::validate 语义一致，用于
 * 市场预检与插件 iframe 激活前校验。
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof manifest !== "object" || manifest === null) {
    return { valid: false, errors: ["manifest 必须是对象"] };
  }
  const m = manifest as Record<string, unknown>;
  const id = typeof m.id === "string" ? m.id : "";
  if (!id.trim()) errors.push("id 不能为空");
  if (/[\\/]/.test(id) || id.includes("..")) errors.push("id 含非法路径字符");
  if (typeof m.name !== "string" || !m.name.trim()) errors.push("name 不能为空");
  const version = typeof m.version === "string" ? m.version : "";
  if (version.split(".").length !== 3) errors.push("version 必须是 semver（x.y.z）");
  const entry = typeof m.entry === "string" ? m.entry : "";
  if (!entry.trim() || entry.includes("..")) errors.push("entry 非法");
  if (m.permissions !== undefined && !Array.isArray(m.permissions)) {
    errors.push("permissions 必须是数组");
  }
  const validPermissions = new Set([
    "fs",
    "exec",
    "storage",
    "git",
    "network",
    "ui",
    "notification",
  ]);
  if (Array.isArray(m.permissions)) {
    for (const perm of m.permissions) {
      if (typeof perm !== "string" || !validPermissions.has(perm)) {
        errors.push(`未知权限: ${String(perm)}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/** 桥接方法对应的 manifest 权限组。 */
export function methodRequiresPermission(method: BridgeMethod): string | null {
  if (method === "ping") return null;
  const group = method.split(".")[0];
  return group === undefined ? null : group;
}

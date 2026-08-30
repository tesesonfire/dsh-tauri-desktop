/**
 * Skills / MCP 管理模型（纯逻辑，可测试）。
 * 数据经桥接 storage 持久化；git 仓库导入经 `git.run`（clone）。
 */

export type ExtensionKind = "skill" | "mcp";
export type ExtensionStatus = "enabled" | "disabled";

export interface ExtensionEntry {
  id: string;
  kind: ExtensionKind;
  name: string;
  description: string;
  /** skill: 指令内容；mcp: 启动命令 */
  spec: string;
  status: ExtensionStatus;
  importedFrom?: string | null;
  addedAt: number;
}

export function isValidExtensionId(id: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,63}$/.test(id);
}

/** 扩展仓库（Skills + MCP） */
export class ExtensionRegistry {
  private entries = new Map<string, ExtensionEntry>();

  upsert(entry: Omit<ExtensionEntry, "status" | "addedAt"> & { status?: ExtensionStatus; addedAt?: number }): ExtensionEntry {
    if (!isValidExtensionId(entry.id)) {
      throw new Error(`无效扩展 id: ${entry.id}`);
    }
    const existing = this.entries.get(entry.id);
    const record: ExtensionEntry = {
      ...entry,
      status: entry.status ?? existing?.status ?? "enabled",
      addedAt: entry.addedAt ?? existing?.addedAt ?? Date.now(),
    };
    this.entries.set(entry.id, record);
    return record;
  }

  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  setEnabled(id: string, enabled: boolean): ExtensionEntry | null {
    const entry = this.entries.get(id);
    if (entry === undefined) return null;
    entry.status = enabled ? "enabled" : "disabled";
    return entry;
  }

  list(kind?: ExtensionKind, status?: ExtensionStatus): ExtensionEntry[] {
    return Array.from(this.entries.values())
      .filter((e) => (kind === undefined || e.kind === kind) && (status === undefined || e.status === status))
      .sort((a, b) => a.addedAt - b.addedAt);
  }

  get(id: string): ExtensionEntry | null {
    return this.entries.get(id) ?? null;
  }

  /** 序列化 / 恢复（对应 storage 持久化） */
  toJSON(): ExtensionEntry[] {
    return this.list();
  }

  load(items: ExtensionEntry[]): void {
    this.entries.clear();
    for (const item of items) {
      this.entries.set(item.id, item);
    }
  }
}

/** 技能仓库 URL 解析：支持 https 与 owner/repo 简写 */
export function normalizeRepoRef(ref: string): string {
  const trimmed = ref.trim().replace(/\.git$/, "");
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  const shorthand = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (shorthand !== null) {
    return `https://github.com/${shorthand[1]}/${shorthand[2]}`;
  }
  throw new Error(`无法识别的仓库地址: ${ref}`);
}

/** 导入流程的命令构建（clone 到扩展目录） */
export function importCommands(repoUrl: string, targetDir: string): string[][] {
  return [
    ["clone", repoUrl, targetDir],
    ["-C", targetDir, "log", "-1", "--format=%h %s"],
  ];
}

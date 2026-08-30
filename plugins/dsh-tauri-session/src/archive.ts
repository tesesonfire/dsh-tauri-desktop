/**
 * 会话归档模型（纯逻辑，可测试）。
 * dsh 会话的「删除工作区」在本插件中改为「归档」：可搜索、排序、分组、
 * 按项目筛选、取消归档；只有「永久删除」才真正移除记录。
 */

export interface ArchivedSession {
  id: string;
  title: string;
  project: string | null;
  archivedAt: number;
  messageCount: number;
}

export type SortKey = "archivedAt" | "title" | "messageCount";
export type SortOrder = "asc" | "desc";
export type GroupKey = "none" | "project" | "day";

/** 归档存档（本地镜像，实际会话数据由 dsh 管理） */
export class SessionArchive {
  private entries = new Map<string, ArchivedSession>();

  archive(session: Omit<ArchivedSession, "archivedAt">, now = Date.now()): ArchivedSession {
    const record: ArchivedSession = { ...session, archivedAt: now };
    this.entries.set(record.id, record);
    return record;
  }

  /** 取消归档：从归档列表移除（回到 dsh 正常会话） */
  unarchive(id: string): boolean {
    return this.entries.delete(id);
  }

  /** 永久删除（区别于取消归档：同时丢弃元数据） */
  purge(id: string): boolean {
    return this.unarchive(id);
  }

  get(id: string): ArchivedSession | null {
    return this.entries.get(id) ?? null;
  }

  list(): ArchivedSession[] {
    return Array.from(this.entries.values());
  }
}

export interface ArchiveQuery {
  search?: string;
  project?: string | null;
  sortKey?: SortKey;
  sortOrder?: SortOrder;
}

/** 搜索 + 筛选 + 排序 */
export function queryArchive(sessions: ArchivedSession[], query: ArchiveQuery = {}): ArchivedSession[] {
  const search = (query.search ?? "").trim().toLowerCase();
  let result = sessions.filter((session) => {
    if (search !== "" && !session.title.toLowerCase().includes(search)) {
      return false;
    }
    if (query.project !== undefined && query.project !== null && session.project !== query.project) {
      return false;
    }
    return true;
  });
  const sortKey = query.sortKey ?? "archivedAt";
  const order = query.sortOrder ?? "desc";
  result = [...result].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const compared =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : Number(av) - Number(bv);
    return order === "asc" ? compared : -compared;
  });
  return result;
}

/** 分组：project 按项目名；day 按归档日期（本地时区） */
export function groupArchive(sessions: ArchivedSession[], groupKey: GroupKey): Map<string, ArchivedSession[]> {
  const groups = new Map<string, ArchivedSession[]>();
  for (const session of sessions) {
    let key: string;
    if (groupKey === "project") {
      key = session.project ?? "（无项目）";
    } else if (groupKey === "day") {
      key = new Date(session.archivedAt).toLocaleDateString();
    } else {
      key = "全部";
    }
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [session]);
    } else {
      bucket.push(session);
    }
  }
  return groups;
}

/** 项目列表（筛选器候选） */
export function listProjects(sessions: ArchivedSession[]): string[] {
  const projects = new Set<string>();
  for (const session of sessions) {
    if (session.project !== null) projects.add(session.project);
  }
  return Array.from(projects).sort();
}

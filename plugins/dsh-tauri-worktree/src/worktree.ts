/**
 * Git Worktree 命令构建与状态管理（纯逻辑，可测试）。
 * 实际 git 调用经桥接 `git.run`（白名单子命令 worktree/branch）。
 */

export type WorktreeStatus = "active" | "archived";

export interface WorktreeEntry {
  id: string;
  /** 会话 id（一个会话一个 worktree） */
  sessionId: string;
  branch: string;
  path: string;
  status: WorktreeStatus;
  createdAt: number;
}

/** 分支名清洗：只保留 git 安全字符 */
export function sanitizeBranchName(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 64);
  return cleaned === "" ? "worktree" : cleaned;
}

export const WorktreeCommands = {
  /** git worktree add <path> -b <branch> */
  add(worktreePath: string, branch: string): string[] {
    return ["worktree", "add", worktreePath, "-b", branch];
  },
  /** git worktree list --porcelain */
  list(): string[] {
    return ["worktree", "list", "--porcelain"];
  },
  /** git worktree remove <path> */
  remove(worktreePath: string): string[] {
    return ["worktree", "remove", worktreePath];
  },
  /** 归档 = 锁定 worktree（保留磁盘内容，从常规列表隐藏） */
  lock(worktreePath: string): string[] {
    return ["worktree", "lock", worktreePath];
  },
  unlock(worktreePath: string): string[] {
    return ["worktree", "unlock", worktreePath];
  },
  /** git -C <path> checkout <branch> */
  checkout(worktreePath: string, branch: string): string[] {
    return ["-C", worktreePath, "checkout", branch];
  },
  /** git worktree prune */
  prune(): string[] {
    return ["worktree", "prune"];
  },
};

/** 解析 `git worktree list --porcelain` 输出 */
export interface ParsedWorktree {
  path: string;
  head: string;
  branch: string | null;
  bare: boolean;
}

export function parseWorktreeList(output: string): ParsedWorktree[] {
  const entries: ParsedWorktree[] = [];
  let current: Partial<ParsedWorktree> = {};
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.path !== undefined) {
        entries.push({
          path: current.path,
          head: current.head ?? "",
          branch: current.branch ?? null,
          bare: current.bare ?? false,
        });
      }
      current = {};
      continue;
    }
    if (trimmed.startsWith("worktree ")) {
      current.path = trimmed.slice("worktree ".length);
    } else if (trimmed.startsWith("HEAD ")) {
      current.head = trimmed.slice("HEAD ".length);
    } else if (trimmed.startsWith("branch ")) {
      current.branch = trimmed.slice("branch ".length).replace("refs/heads/", "");
    } else if (trimmed === "bare") {
      current.bare = true;
    }
  }
  if (current.path !== undefined) {
    entries.push({
      path: current.path,
      head: current.head ?? "",
      branch: current.branch ?? null,
      bare: current.bare ?? false,
    });
  }
  return entries;
}

/** Worktree 记录簿（本地状态，与 git 实际状态对账） */
export class WorktreeRegistry {
  private entries = new Map<string, WorktreeEntry>();

  /** 创建记录（默认检出为新分支） */
  create(sessionId: string, worktreePath: string, now = Date.now()): WorktreeEntry {
    const branch = sanitizeBranchName(`dsh/${sessionId}`);
    const entry: WorktreeEntry = {
      id: `wt-${sessionId}`,
      sessionId,
      branch,
      path: worktreePath,
      status: "active",
      createdAt: now,
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  get(sessionId: string): WorktreeEntry | null {
    return this.entries.get(`wt-${sessionId}`) ?? null;
  }

  /** 归档（archived）：锁定但不删除 */
  archive(sessionId: string): WorktreeEntry | null {
    const entry = this.entries.get(`wt-${sessionId}`);
    if (entry === undefined) return null;
    entry.status = "archived";
    return entry;
  }

  /** 恢复归档 */
  restore(sessionId: string): WorktreeEntry | null {
    const entry = this.entries.get(`wt-${sessionId}`);
    if (entry === undefined) return null;
    entry.status = "active";
    return entry;
  }

  /** 删除记录（配合 git worktree remove + prune） */
  remove(sessionId: string): boolean {
    return this.entries.delete(`wt-${sessionId}`);
  }

  list(status?: WorktreeStatus): WorktreeEntry[] {
    const all = Array.from(this.entries.values());
    return status === undefined ? all : all.filter((e) => e.status === status);
  }
}

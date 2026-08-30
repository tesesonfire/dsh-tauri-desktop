import { describe, expect, it } from "vitest";
import {
  parseWorktreeList,
  sanitizeBranchName,
  WorktreeCommands,
  WorktreeRegistry,
} from "../src/worktree";

describe("sanitizeBranchName", () => {
  it("keeps git-safe characters", () => {
    expect(sanitizeBranchName("dsh/session 01")).toBe("dsh/session-01");
    expect(sanitizeBranchName("  Fix: Bug! ")).toBe("fix-bug");
  });

  it("falls back for empty input", () => {
    expect(sanitizeBranchName("***")).toBe("worktree");
  });

  it("limits length to 64", () => {
    expect(sanitizeBranchName("a".repeat(100))).toHaveLength(64);
  });
});

describe("WorktreeCommands", () => {
  it("builds add/list/remove/lock commands", () => {
    expect(WorktreeCommands.add("C:\\wt\\s1", "dsh/s1")).toEqual([
      "worktree", "add", "C:\\wt\\s1", "-b", "dsh/s1",
    ]);
    expect(WorktreeCommands.list()).toEqual(["worktree", "list", "--porcelain"]);
    expect(WorktreeCommands.remove("C:\\wt\\s1")).toEqual(["worktree", "remove", "C:\\wt\\s1"]);
    expect(WorktreeCommands.lock("C:\\wt\\s1")).toEqual(["worktree", "lock", "C:\\wt\\s1"]);
    expect(WorktreeCommands.checkout("C:\\wt\\s1", "main")).toEqual([
      "-C", "C:\\wt\\s1", "checkout", "main",
    ]);
    expect(WorktreeCommands.prune()).toEqual(["worktree", "prune"]);
  });

  it("all commands stay in the git allowlist subcommand", () => {
    const samples = [
      WorktreeCommands.add("p", "b"),
      WorktreeCommands.list(),
      WorktreeCommands.remove("p"),
      WorktreeCommands.lock("p"),
      WorktreeCommands.unlock("p"),
      WorktreeCommands.checkout("p", "main"),
      WorktreeCommands.prune(),
    ];
    for (const args of samples) {
      expect(args[0] === "worktree" || args[0] === "-C").toBe(true);
    }
  });
});

describe("parseWorktreeList", () => {
  it("parses porcelain output", () => {
    const output = [
      "worktree C:/repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree C:/wt/s1",
      "HEAD def456",
      "branch refs/heads/dsh/s1",
      "",
      "worktree C:/bare",
      "bare",
      "",
    ].join("\n");
    const parsed = parseWorktreeList(output);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({ path: "C:/repo", head: "abc123", branch: "main", bare: false });
    expect(parsed[1]?.branch).toBe("dsh/s1");
    expect(parsed[2]?.bare).toBe(true);
  });

  it("handles missing branch and trailing entry", () => {
    const parsed = parseWorktreeList("worktree C:/x\nHEAD h1\n");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.branch).toBeNull();
  });
});

describe("WorktreeRegistry", () => {
  it("create/archive/restore/remove lifecycle", () => {
    const registry = new WorktreeRegistry();
    const entry = registry.create("s1", "C:/wt/s1", 1000);
    expect(entry.branch).toBe("dsh/s1");
    expect(entry.status).toBe("active");

    expect(registry.archive("s1")?.status).toBe("archived");
    expect(registry.list("active")).toHaveLength(0);
    expect(registry.list("archived")).toHaveLength(1);

    expect(registry.restore("s1")?.status).toBe("active");
    expect(registry.remove("s1")).toBe(true);
    expect(registry.get("s1")).toBeNull();
  });

  it("returns null for unknown sessions", () => {
    const registry = new WorktreeRegistry();
    expect(registry.get("nope")).toBeNull();
    expect(registry.archive("nope")).toBeNull();
  });
});

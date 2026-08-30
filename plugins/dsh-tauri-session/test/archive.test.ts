import { describe, expect, it } from "vitest";
import {
  groupArchive,
  listProjects,
  queryArchive,
  SessionArchive,
  type ArchivedSession,
} from "../src/archive";

function sample(): ArchivedSession[] {
  const day = new Date(2026, 7, 30, 10, 0).getTime();
  return [
    { id: "s1", title: "修复登录 Bug", project: "web", archivedAt: day, messageCount: 12 },
    { id: "s2", title: "重构 API 网关", project: "api", archivedAt: day + 86_400_000, messageCount: 40 },
    { id: "s3", title: "登录页样式调整", project: "web", archivedAt: day - 86_400_000, messageCount: 3 },
    { id: "s4", title: "随机实验", project: null, archivedAt: day + 1000, messageCount: 7 },
  ];
}

describe("SessionArchive", () => {
  it("archive/unarchive/purge lifecycle", () => {
    const archive = new SessionArchive();
    archive.archive({ id: "s1", title: "T", project: null, messageCount: 1 }, 1000);
    expect(archive.get("s1")?.archivedAt).toBe(1000);
    expect(archive.unarchive("s1")).toBe(true);
    expect(archive.get("s1")).toBeNull();
    expect(archive.unarchive("s1")).toBe(false);
  });

  it("purge removes permanently", () => {
    const archive = new SessionArchive();
    archive.archive({ id: "s2", title: "X", project: "p", messageCount: 2 }, 1);
    archive.purge("s2");
    expect(archive.list()).toHaveLength(0);
  });
});

describe("queryArchive", () => {
  it("search matches title case-insensitively", () => {
    const result = queryArchive(sample(), { search: "登录" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("filters by project", () => {
    const result = queryArchive(sample(), { project: "web" });
    expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("sorts by keys with order", () => {
    const byCount = queryArchive(sample(), { sortKey: "messageCount", sortOrder: "desc" });
    expect(byCount[0]?.id).toBe("s2");
    const byTitleAsc = queryArchive(sample(), { sortKey: "title", sortOrder: "asc" });
    expect(byTitleAsc.map((s) => s.title)).toEqual([...byTitleAsc.map((s) => s.title)].sort((a, b) => a.localeCompare(b)));
    const byTimeAsc = queryArchive(sample(), { sortKey: "archivedAt", sortOrder: "asc" });
    expect(byTimeAsc[0]?.id).toBe("s3");
  });
});

describe("groupArchive", () => {
  it("groups by project with fallback label", () => {
    const groups = groupArchive(sample(), "project");
    expect(groups.get("web")?.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(groups.get("（无项目）")?.map((s) => s.id)).toEqual(["s4"]);
  });

  it("groups by day", () => {
    const groups = groupArchive(sample(), "day");
    const total = Array.from(groups.values()).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(4);
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  it("no grouping returns single bucket", () => {
    const groups = groupArchive(sample(), "none");
    expect(groups.size).toBe(1);
    expect(groups.get("全部")).toHaveLength(4);
  });
});

describe("listProjects", () => {
  it("collects unique sorted projects, ignoring null", () => {
    expect(listProjects(sample())).toEqual(["api", "web"]);
  });
});

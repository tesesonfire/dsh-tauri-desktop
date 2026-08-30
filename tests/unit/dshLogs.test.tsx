import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DshLogs, filterLogLines } from "@/components/DshLogs";
import { useDshStore } from "@/stores/dshStore";
import type { LogLine } from "@/types/dsh";

function line(level: LogLine["level"], text: string, ts = "2026-08-31T02:00:00Z"): LogLine {
  return { level, line: text, ts };
}

const SAMPLE: LogLine[] = [
  line("info", "dsh 启动中"),
  line("success", "WebUI listening on 3080"),
  line("warn", "deprecation notice"),
  line("error", "ECONNREFUSED 127.0.0.1:3080"),
];

describe("filterLogLines", () => {
  it("returns all lines for all + empty query", () => {
    expect(filterLogLines(SAMPLE, "all", "")).toHaveLength(4);
  });

  it("filters by level", () => {
    const errors = filterLogLines(SAMPLE, "error", "");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toContain("ECONNREFUSED");
    expect(filterLogLines(SAMPLE, "success", "")).toHaveLength(1);
  });

  it("matches keyword case-insensitively", () => {
    const hits = filterLogLines(SAMPLE, "all", "LISTENING");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.level).toBe("success");
  });

  it("combines level and keyword", () => {
    expect(filterLogLines(SAMPLE, "error", "listening")).toHaveLength(0);
    expect(filterLogLines(SAMPLE, "all", "启动")).toHaveLength(1);
  });

  it("ignores whitespace-only query", () => {
    expect(filterLogLines(SAMPLE, "all", "   ")).toHaveLength(4);
  });
});

describe("DshLogs interactions", () => {
  beforeEach(() => {
    useDshStore.setState({ logs: SAMPLE });
  });

  it("renders all lines then filters by search box", () => {
    render(<DshLogs />);
    expect(screen.getByText(/listening on 3080/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜索日志"), {
      target: { value: "econnrefused" },
    });
    expect(screen.getByText(/ECONNREFUSED/)).toBeTruthy();
    expect(screen.queryByText(/listening on 3080/)).toBeNull();
  });

  it("level buttons narrow the view and empty state shows hint", () => {
    render(<DshLogs />);
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    expect(screen.getByText(/ECONNREFUSED/)).toBeTruthy();
    expect(screen.queryByText(/dsh 启动中/)).toBeNull();
    fireEvent.change(screen.getByLabelText("搜索日志"), { target: { value: "不存在" } });
    expect(screen.getByText("暂无匹配日志")).toBeTruthy();
  });

  it("aria-pressed reflects active filter", () => {
    render(<DshLogs />);
    const warnBtn = screen.getByRole("button", { name: "warn" });
    expect(warnBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(warnBtn);
    expect(warnBtn.getAttribute("aria-pressed")).toBe("true");
  });
});

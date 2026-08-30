import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Toaster } from "@/components/ui/Toaster";
import { toast, useToastStore } from "@/stores/toastStore";

/** Toaster 全局渲染器测试：store → UI 的最后一段链路。 */

describe("Toaster", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("renders pushed toasts with kind-specific styling", () => {
    toast.success("已保存");
    toast.error("启动失败");
    toast.warn("版本过期");
    toast.info("提示信息");
    render(<Toaster />);
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(4);
    expect(screen.getByText("已保存").className).toContain("brand-success");
    expect(screen.getByText("启动失败").className).toContain("destructive");
    expect(screen.getByText("版本过期").className).toContain("brand-warning");
  });

  it("clicking a toast dismisses it", () => {
    toast.info("点击我关闭");
    render(<Toaster />);
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(screen.getByRole("status"));
    expect(useToastStore.getState().toasts).toHaveLength(0);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing without active toasts", () => {
    render(<Toaster />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

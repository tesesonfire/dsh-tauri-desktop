import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Dialog } from "@/components/ui/Dialog";
import { Markdown } from "@/components/Markdown";
import { ActivityBar } from "@/components/ActivityBar";
import { DshFrame } from "@/components/DshFrame";
import { useDshStore } from "@/stores/dshStore";
import type { DshStatus } from "@/types/dsh";

describe("ui primitives", () => {
  it("Button renders label and handles click", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>启动</Button>);
    fireEvent.click(screen.getByRole("button", { name: "启动" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Button disables interaction", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>禁用</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("Switch toggles and reports checked", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Badge applies variant class", () => {
    const { container } = render(<Badge variant="success">运行中</Badge>);
    const badge = container.firstElementChild;
    expect(badge).toHaveTextContent("运行中");
    expect(badge?.className).toContain("brand-success");
  });

  it("Tabs switches active item", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        items={[
          { id: "a", label: "通用" },
          { id: "b", label: "高级" },
        ]}
        active="a"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("tab", { name: "通用" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "高级" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Dialog closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="确认" onClose={onClose}>
        内容
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Dialog renders nothing when closed", () => {
    const { container } = render(
      <Dialog open={false} title="x" onClose={() => undefined}>
        y
      </Dialog>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Markdown", () => {
  it("renders sanitized html", () => {
    const { container } = render(
      <Markdown content={"# 标题\n\n正文 <script>alert(1)</script>"} />,
    );
    expect(container.querySelector("h1")).toHaveTextContent("标题");
    expect(container.querySelector("script")).toBeNull();
  });
});

describe("ActivityBar", () => {
  it("renders fixed items and reports selection", () => {
    const onChange = vi.fn();
    render(<ActivityBar active="dsh" onChange={onChange} />);
    const dshButton = screen.getByRole("button", { name: "dsh WebUI" });
    expect(dshButton.className).toContain("bg-accent");
    fireEvent.click(screen.getByRole("button", { name: "插件市场" }));
    expect(onChange).toHaveBeenCalledWith("plugins");
  });
});

describe("DshFrame", () => {
  beforeEach(() => {
    useDshStore.setState({ status: null, connect: "loading", logs: [] });
  });

  it("shows start prompt when service is idle", () => {
    useDshStore.setState({ status: null, connect: "stopped" });
    render(<DshFrame />);
    expect(screen.getByText("dsh 服务未启动")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /启动 dsh/ })).toBeInTheDocument();
  });

  it("shows loading spinner while starting", () => {
    const status: DshStatus = {
      state: "starting",
      pid: null,
      port: 3080,
      host: "127.0.0.1",
      profile: null,
      restarts: 0,
      lastError: null,
      startedAt: null,
    };
    useDshStore.setState({ status, connect: "loading" });
    render(<DshFrame />);
    expect(screen.getByText(/正在连接 dsh 服务/)).toBeInTheDocument();
  });

  it("renders iframe pointing at dsh when running and connected", () => {
    const status: DshStatus = {
      state: "running",
      pid: 1234,
      port: 3080,
      host: "127.0.0.1",
      profile: null,
      restarts: 0,
      lastError: null,
      startedAt: new Date().toISOString(),
    };
    useDshStore.setState({ status, connect: "connected" });
    render(<DshFrame />);
    const iframe = document.querySelector("iframe[title='dsh Web UI']");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("http://127.0.0.1:3080/");
  });

  it("shows retry on disconnect", () => {
    const status: DshStatus = {
      state: "running",
      pid: 1234,
      port: 3080,
      host: "127.0.0.1",
      profile: null,
      restarts: 0,
      lastError: null,
      startedAt: new Date().toISOString(),
    };
    useDshStore.setState({ status, connect: "disconnected" });
    render(<DshFrame />);
    expect(screen.getByText("无法连接 dsh 服务")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试连接" })).toBeInTheDocument();
  });
});

describe("TitleBar", () => {
  it("renders window controls on non-mac platform and close works", async () => {
    const win = {
      isMaximized: vi.fn(async () => false),
      onResized: vi.fn(async () => () => undefined),
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => win,
    }));
    const { default: TitleBarMock } = await import("@/components/TitleBar");
    render(<TitleBarMock />);
    expect(screen.getByTitle("最小化")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("关闭"));
    await vi.waitFor(() => expect(win.close).toHaveBeenCalled());
    vi.doUnmock("@tauri-apps/api/window");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PluginHost } from "@/plugins/PluginHost";
import type { PluginInfo } from "@/types/plugin";

/** PluginHost 组件测试：iframe 资源 URL、禁用/错误态、加载失败重试。 */

function makePlugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
  return {
    manifest: {
      id: "com.host.demo",
      name: "Demo",
      version: "0.1.0",
      description: "",
      author: "",
      entry: "index.html",
      permissions: [],
      contributes: { sidebar: [], panel: [], command: [], setting: [] },
    },
    dir: "",
    enabled: true,
    builtin: true,
    error: null,
    ...overrides,
  };
}

describe("PluginHost", () => {
  it("renders sandboxed iframe with plugin protocol url and bridge marker", () => {
    const { container } = render(<PluginHost plugin={makePlugin()} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("data-plugin-frame")).toBe("com.host.demo");
    expect(iframe?.getAttribute("title")).toBe("Demo");
    expect(iframe?.getAttribute("sandbox")).toContain("allow-scripts");
    const src = iframe?.getAttribute("src") ?? "";
    const protocolOk =
      src.startsWith("dshplugin://com.host.demo/") ||
      src.startsWith("http://dshplugin.localhost/com.host.demo/");
    expect(protocolOk).toBe(true);
  });

  it("shows unavailable state for disabled plugin", () => {
    render(<PluginHost plugin={makePlugin({ enabled: false })} />);
    expect(screen.getByText("插件不可用")).toBeTruthy();
    expect(screen.getByText("插件已被禁用")).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("shows unavailable state with backend error detail", () => {
    render(<PluginHost plugin={makePlugin({ error: "manifest 解析失败: bad json" })} />);
    expect(screen.getByText("插件不可用")).toBeTruthy();
    expect(screen.getByText(/manifest 解析失败/)).toBeTruthy();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("load error overlay can be dismissed via retry", async () => {
    const { container } = render(<PluginHost plugin={makePlugin()} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    // 模拟 iframe 加载失败（error 事件需冒泡才能被 React 根容器委托捕获；
    // React 18 并发调度下状态刷新是异步的，用 findBy 等待）
    iframe?.dispatchEvent(new Event("error", { bubbles: true }));
    await screen.findByText("插件界面加载失败", undefined, { timeout: 3000 });
    // 重试后覆盖层消失
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.queryByText("插件界面加载失败")).toBeNull());
  });

  it("exposes the bridge broadcast marker exactly once per plugin id", () => {
    render(
      <>
        <PluginHost plugin={makePlugin()} />
        <PluginHost plugin={makePlugin({ manifest: { ...makePlugin().manifest, id: "com.host.other", name: "Other" } })} />
      </>,
    );
    expect(document.querySelectorAll("[data-plugin-frame='com.host.demo']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-plugin-frame='com.host.other']")).toHaveLength(1);
    expect(document.querySelectorAll("iframe")).toHaveLength(2);
  });
});

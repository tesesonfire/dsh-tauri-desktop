import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/Markdown";

/** Markdown 消毒测试：插件 README / 更新日志为远端内容，注入必须被 DOMPurify 过滤。 */

describe("Markdown sanitization", () => {
  it("renders normal markdown structure", () => {
    const { container } = render(<Markdown content={"# 标题\n\n正文 **加粗**。"} />);
    expect(container.querySelector("h1")?.textContent).toBe("标题");
    expect(container.querySelector("strong")?.textContent).toBe("加粗");
  });

  it("strips inline script tags", () => {
    const { container } = render(
      <Markdown content={"before<script>window.__xss=1</script>after"} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it("strips event handlers and javascript: urls", () => {
    const { container } = render(
      <Markdown
        content={
          '<img src=x onerror="alert(1)"> [click](javascript:alert(2)) [ok](https://example.com)'
        }
      />,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("onerror")).toBeNull();
    const links = Array.from(container.querySelectorAll("a"));
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href.startsWith("javascript:")).toBe(false);
    }
    // 正常 https 链接保留
    expect(links.some((l) => l.getAttribute("href") === "https://example.com")).toBe(true);
  });

  it("strips iframe and object embeds from untrusted content", () => {
    const { container } = render(
      <Markdown content={'<iframe src="https://evil.example"></iframe><object data="x"></object>'} />,
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("object")).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { detectPlatform, useWindowStore } from "@/stores/windowStore";

/** detectPlatform 平台分支测试（UA 覆盖）与 windowStore 平台记录。 */

const originalUA = navigator.userAgent;

function withUA(ua: string): void {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

describe("detectPlatform", () => {
  afterEach(() => {
    withUA(originalUA);
  });

  it("maps user agents to platform names", () => {
    withUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36");
    expect(detectPlatform()).toBe("macos");

    withUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    expect(detectPlatform()).toBe("windows");

    withUA("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36");
    expect(detectPlatform()).toBe("linux");
  });

  it("falls back to unknown for unrecognized agents", () => {
    withUA("Mozilla/5.0 (Nintendo Switch)");
    expect(detectPlatform()).toBe("unknown");
  });
});

describe("windowStore.setPlatform", () => {
  it("records the detected platform for the title bar", () => {
    const store = useWindowStore.getState();
    store.setPlatform("windows");
    expect(useWindowStore.getState().platform).toBe("windows");
    store.setPlatform("macos");
    expect(useWindowStore.getState().platform).toBe("macos");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appVersion,
  coreListVersions,
  dshStop,
  marketInstall,
  pluginStorageGet,
} from "@/services/tauriService";

/** tauriService 统一错误包装测试：mock @tauri-apps/api/core 的 invoke。 */

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("tauriService error wrapping", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("wraps string rejections into contextual Errors", async () => {
    invoke.mockRejectedValue("profile 不存在");
    const err = await appVersion().then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe("[app_version] profile 不存在");
    expect(err?.cause).toBe("profile 不存在");
  });

  it("wraps object rejections via JSON.stringify", async () => {
    invoke.mockRejectedValue({ code: 500 });
    await expect(dshStop()).rejects.toThrow(/^\[dsh_stop\] /);
  });

  it("passes arguments through to invoke by name", async () => {
    invoke.mockResolvedValue([]);
    await coreListVersions();
    // call() 在无参数时也带第二实参（undefined），保证 invoke 形参形态一致
    expect(invoke).toHaveBeenCalledWith("core_list_versions", undefined);
    invoke.mockResolvedValue(null);
    await pluginStorageGet("com.a", "key");
    expect(invoke).toHaveBeenCalledWith("plugin_storage_get", {
      pluginId: "com.a",
      key: "key",
    });
  });

  it("null-optional args are normalized before invoke", async () => {
    invoke.mockResolvedValue({ manifest: { id: "x" } });
    await marketInstall("owner/repo");
    expect(invoke).toHaveBeenCalledWith("market_install", {
      repo: "owner/repo",
      subpath: null,
    });
    await marketInstall("owner/repo", "packages/x");
    expect(invoke).toHaveBeenLastCalledWith("market_install", {
      repo: "owner/repo",
      subpath: "packages/x",
    });
  });
});

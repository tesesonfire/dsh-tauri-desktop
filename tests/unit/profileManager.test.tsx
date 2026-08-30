import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfileManagerPage from "@/pages/ProfileManagerPage";
import { useProfileStore } from "@/stores/profileStore";
import { serviceMock } from "../helpers/mockTauriService";
import type { Profile } from "@/types/dsh";

/** ProfileManagerPage 测试：创建/切换/删除/导入导出链路（共享 mock 工厂）。 */

vi.mock("@/services/tauriService", async () => {
  const { buildTauriServiceMockModule } = await import("../helpers/mockTauriService");
  return buildTauriServiceMockModule();
});

function profile(id: string, name: string): Profile {
  return { id, name, dshHome: `x/${id}`, defaultPort: 3080, createdAt: "", extra: {} };
}

describe("ProfileManagerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock("profileList").mockResolvedValue([]);
    serviceMock("profileActive").mockResolvedValue("");
    serviceMock("profileCreate").mockResolvedValue(profile("dev", "dev"));
    serviceMock("profileSwitch").mockResolvedValue(undefined);
    serviceMock("profileDelete").mockResolvedValue(undefined);
    serviceMock("profileExport").mockResolvedValue(undefined);
    serviceMock("profileImport").mockResolvedValue(profile("imported", "imported"));
    serviceMock("dshStart").mockResolvedValue({
      state: "starting", pid: null, host: "127.0.0.1", port: 3080,
      profile: null, restarts: 0, lastError: null, startedAt: null,
    });
    useProfileStore.setState({ profiles: [], activeId: "", error: null });
  });

  it("renders profiles after refresh and marks the active one", async () => {
    serviceMock("profileList").mockResolvedValue([profile("a", "alpha"), profile("b", "beta")]);
    serviceMock("profileActive").mockResolvedValue("b");
    render(<ProfileManagerPage />);
    await waitFor(() => expect(screen.getByText("alpha")).toBeTruthy());
    expect(screen.getByText("beta")).toBeTruthy();
    const badges = screen.getAllByText("当前");
    expect(badges).toHaveLength(1);
  });

  it("creates a profile from name and port inputs", async () => {
    render(<ProfileManagerPage />);
    await waitFor(() => expect(serviceMock("profileList")).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("档案名（字母数字 . _ -）"), {
      target: { value: "dev" },
    });
    fireEvent.change(screen.getByPlaceholderText("端口"), {
      target: { value: "4000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /创建/ }));
    await waitFor(() =>
      expect(serviceMock("profileCreate")).toHaveBeenCalledWith("dev", 4000),
    );
  });

  it("export and delete act on the named profile", async () => {
    // 页面挂载即 refresh：mock 列表与 store 预置需一致，否则会被空列表覆盖
    serviceMock("profileList").mockResolvedValue([profile("alpha", "alpha")]);
    serviceMock("profileActive").mockResolvedValue("alpha");
    render(<ProfileManagerPage />);
    await waitFor(() => expect(screen.getAllByText("alpha").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /导出/ }));
    await waitFor(() =>
      expect(serviceMock("profileExport")).toHaveBeenCalledWith(
        "alpha",
        "alpha.profile.json",
      ),
    );
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(screen.getByRole("button", { name: /删除/ }));
    await waitFor(() =>
      expect(serviceMock("profileDelete")).toHaveBeenCalledWith("alpha"),
    );
    vi.unstubAllGlobals();
  });

  it("import prompts for path and refreshes", async () => {
    const prompt = vi.fn(() => "D:/backup/dev.profile.json");
    vi.stubGlobal("prompt", prompt);
    render(<ProfileManagerPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /导入/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /导入/ }));
    await waitFor(() =>
      expect(serviceMock("profileImport")).toHaveBeenCalledWith("D:/backup/dev.profile.json"),
    );
    vi.unstubAllGlobals();
  });
});

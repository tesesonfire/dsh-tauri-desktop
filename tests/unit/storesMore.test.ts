import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginStore } from "@/stores/pluginStore";
import { useProfileStore } from "@/stores/profileStore";
import type { PluginInfo, SidebarEntry } from "@/types/plugin";
import type { Profile } from "@/types/dsh";

/** pluginStore / profileStore 状态机单测（tauriService 整模块 mock，vi.hoisted 保参数透传）。 */

const mocks = vi.hoisted(() => ({
  pluginList: vi.fn(),
  pluginSetEnabled: vi.fn(),
  pluginUninstall: vi.fn(),
  pluginInstall: vi.fn(),
  profileList: vi.fn(),
  profileActive: vi.fn(),
  profileCreate: vi.fn(),
  profileDelete: vi.fn(),
  profileSwitch: vi.fn(),
}));

vi.mock("@/services/tauriService", () => mocks);

function makePlugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
  return {
    manifest: {
      id: "com.test.a",
      name: "A",
      version: "0.1.0",
      description: "",
      author: "",
      entry: "index.html",
      permissions: [],
      contributes: { sidebar: [], panel: [], command: [], setting: [] },
    },
    dir: "",
    enabled: true,
    builtin: false,
    error: null,
    ...overrides,
  };
}

function entry(id: string): SidebarEntry {
  return { id, title: id, icon: "puzzle" };
}

describe("pluginStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePluginStore.setState({
      plugins: [],
      sidebarEntries: [],
      activeSidebarId: null,
      panels: [],
      error: null,
      loading: false,
    });
  });

  it("refresh aggregates sidebar entries from enabled, error-free plugins", async () => {
    mocks.pluginList.mockResolvedValue([
      makePlugin({
        manifest: {
          id: "com.test.a",
          name: "A",
          version: "0.1.0",
          description: "",
          author: "",
          entry: "index.html",
          permissions: [],
          contributes: { sidebar: [entry("one"), entry("two")], panel: [], command: [], setting: [] },
        },
      }),
      makePlugin({ manifest: { ...makePlugin().manifest, id: "com.test.b" }, enabled: false }),
      makePlugin({ manifest: { ...makePlugin().manifest, id: "com.test.c" }, error: "broken" }),
    ]);
    await usePluginStore.getState().refresh();
    const { sidebarEntries, loading, error } = usePluginStore.getState();
    expect(sidebarEntries.map((e) => e.id)).toEqual(["one", "two"]);
    expect(loading).toBe(false);
    expect(error).toBeNull();
  });

  it("registerSidebar replaces same-id entry (bridge passes pluginId-prefixed id)", () => {
    const store = usePluginStore.getState();
    store.registerSidebar({ id: "com.test.a:main", title: "Main", icon: "puzzle" });
    store.registerSidebar({ id: "com.test.a:main", title: "Main v2", icon: "bell" });
    const entries = usePluginStore.getState().sidebarEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.title).toBe("Main v2");
  });

  it("unregisterSidebar drops prefixed entries and clears active id", () => {
    const store = usePluginStore.getState();
    store.registerSidebar({ id: "com.test.a:main", title: "Main", icon: "puzzle" });
    store.registerSidebar({ id: "com.test.b:main", title: "Other", icon: "puzzle" });
    store.setActiveSidebar("com.test.a:main");
    store.unregisterSidebar("com.test.a");
    const { sidebarEntries, activeSidebarId } = usePluginStore.getState();
    expect(sidebarEntries.map((e) => e.id)).toEqual(["com.test.b:main"]);
    expect(activeSidebarId).toBeNull();
  });

  it("unregisterSidebar keeps active id of unrelated plugins", () => {
    const store = usePluginStore.getState();
    store.setActiveSidebar("com.test.b:main");
    store.unregisterSidebar("com.test.a");
    expect(usePluginStore.getState().activeSidebarId).toBe("com.test.b:main");
  });

  it("registerPanel dedups by pluginId+panelId", () => {
    const store = usePluginStore.getState();
    store.registerPanel({ pluginId: "com.test.a", panelId: "view", title: "View" });
    store.registerPanel({ pluginId: "com.test.a", panelId: "view", title: "View v2" });
    store.registerPanel({ pluginId: "com.test.a", panelId: "other", title: "Other" });
    const panels = usePluginStore.getState().panels;
    expect(panels).toHaveLength(2);
    expect(panels.find((p) => p.panelId === "view")?.title).toBe("View v2");
  });

  it("enable calls backend then refreshes", async () => {
    mocks.pluginSetEnabled.mockResolvedValue(undefined);
    mocks.pluginList.mockResolvedValue([]);
    await usePluginStore.getState().enable("com.test.a", true);
    expect(mocks.pluginSetEnabled).toHaveBeenCalledTimes(1);
    expect(mocks.pluginList).toHaveBeenCalledTimes(1);
  });

  it("uninstall removes entries for the plugin and refreshes", async () => {
    mocks.pluginUninstall.mockResolvedValue(undefined);
    mocks.pluginList.mockResolvedValue([]);
    const store = usePluginStore.getState();
    store.registerSidebar({ id: "com.test.a:main", title: "Main", icon: "puzzle" });
    await store.uninstall("com.test.a");
    expect(usePluginStore.getState().sidebarEntries).toHaveLength(0);
    expect(mocks.pluginUninstall).toHaveBeenCalledTimes(1);
  });

  it("refresh surfaces backend errors", async () => {
    mocks.pluginList.mockRejectedValue(new Error("[plugin_list] boom"));
    await usePluginStore.getState().refresh();
    expect(usePluginStore.getState().error).toContain("plugin_list");
    expect(usePluginStore.getState().loading).toBe(false);
  });
});

describe("profileStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({ profiles: [], activeId: "", error: null, loading: false });
  });

  it("refresh loads profiles and active id", async () => {
    const profile: Profile = { id: "p1", name: "default", dshHome: "x", defaultPort: 3080, createdAt: "", extra: {} };
    mocks.profileList.mockResolvedValue([profile]);
    mocks.profileActive.mockResolvedValue("p1");
    await useProfileStore.getState().refresh();
    const { profiles, activeId } = useProfileStore.getState();
    expect(profiles).toHaveLength(1);
    expect(activeId).toBe("p1");
  });

  it("create delegates and refreshes", async () => {
    mocks.profileCreate.mockResolvedValue({
      id: "p2", name: "dev", dshHome: "x", defaultPort: 3080, createdAt: "", extra: {},
    });
    mocks.profileList.mockResolvedValue([]);
    mocks.profileActive.mockResolvedValue("");
    await useProfileStore.getState().create("dev");
    expect(mocks.profileCreate).toHaveBeenCalledTimes(1);
    expect(mocks.profileList).toHaveBeenCalledTimes(1);
  });

  it("remove clears activeId when removing the active profile", async () => {
    useProfileStore.setState({ activeId: "p1" });
    mocks.profileDelete.mockResolvedValue(undefined);
    mocks.profileSwitch.mockResolvedValue(undefined);
    mocks.profileList.mockResolvedValue([]);
    mocks.profileActive.mockResolvedValue("");
    await useProfileStore.getState().remove("p1");
    expect(mocks.profileSwitch).toHaveBeenCalledWith("");
    expect(useProfileStore.getState().activeId).toBe("");
  });

  it("remove keeps activeId for unrelated profiles", async () => {
    useProfileStore.setState({ activeId: "p1" });
    mocks.profileDelete.mockResolvedValue(undefined);
    mocks.profileList.mockResolvedValue([]);
    mocks.profileActive.mockResolvedValue("p1");
    await useProfileStore.getState().remove("p2");
    expect(mocks.profileSwitch).not.toHaveBeenCalled();
    expect(useProfileStore.getState().activeId).toBe("p1");
  });
});

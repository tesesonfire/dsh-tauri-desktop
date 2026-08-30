import { vi } from "vitest";

/** tauriService 页面级测试 mock 工厂。
 *
 * 设计要点（均为踩坑后的修复）：
 * - 必须显式列出全部导出名：vitest 的 mocker 对未在工厂结果中静态可见的
 *   导出会直接报错（"No <name> export is defined on the mock"）。
 * - 事件订阅类导出 resolve 一个 no-op 取消函数，保证组件卸载清理安全。
 * - 其余导出默认 resolve(undefined)；用例按需 `serviceMock("x").mockResolvedValue(...)`。
 * - registry 按测试文件隔离（vitest 每文件独立模块环境），互不泄漏。
 */

const LISTENER_NAMES = new Set([
  "onDshLog",
  "onDshState",
  "onDownloadProgress",
  "onUpdateProgress",
  "onCoreOutdated",
]);

export const TAURI_SERVICE_EXPORTS = [
  "appReady",
  "appVersion",
  "quitApp",
  "openSecondaryWindow",
  "presetsGet",
  "dshStart",
  "dshStop",
  "dshRestart",
  "dshStatus",
  "dshEnvCheck",
  "coreListVersions",
  "coreInstalled",
  "coreCurrent",
  "coreInstall",
  "coreUse",
  "coreRemove",
  "profileList",
  "profileActive",
  "profileCreate",
  "profileDelete",
  "profileSwitch",
  "profileExport",
  "profileImport",
  "pluginList",
  "pluginInstall",
  "pluginUninstall",
  "pluginSetEnabled",
  "pluginSetConfig",
  "pluginGetConfig",
  "pluginReadme",
  "pluginManifest",
  "pluginStorageGet",
  "pluginStorageSet",
  "pluginStorageDelete",
  "pluginBridgeCall",
  "marketOfficial",
  "marketSearch",
  "marketInstall",
  "marketUpgrades",
  "downloadFile",
  "downloadCancel",
  "cliInstallShim",
  "cliStatus",
  "updateCheck",
  "updateDownloadAndApply",
  "updateCurrentVersion",
  "updateRelaunch",
  "notify",
  "settingsGet",
  "settingsSave",
  "onDshLog",
  "onDshState",
  "onDownloadProgress",
  "onUpdateProgress",
  "onCoreOutdated",
] as const;

const registry = new Map<string, ReturnType<typeof vi.fn>>();

export function serviceMock(name: string): ReturnType<typeof vi.fn> {
  let fn = registry.get(name);
  if (fn === undefined) {
    fn = LISTENER_NAMES.has(name)
      ? vi.fn(() => Promise.resolve(() => undefined))
      : vi.fn(() => Promise.resolve(undefined));
    registry.set(name, fn);
  }
  return fn;
}

export async function buildTauriServiceMockModule(): Promise<Record<string, unknown>> {
  const moduleObject: Record<string, unknown> = {};
  for (const name of TAURI_SERVICE_EXPORTS) {
    moduleObject[name] = serviceMock(name);
  }
  return moduleObject;
}

/** 页面测试常用的后端契约兜底：refresh 链路上的列表/状态返回合法空值。 */
export function stubEmptyBackendContracts(): void {
  serviceMock("dshStatus").mockResolvedValue({
    state: "idle",
    pid: null,
    host: "127.0.0.1",
    port: 3080,
    profile: null,
    restarts: 0,
    lastError: null,
    startedAt: null,
  });
  serviceMock("pluginList").mockResolvedValue([]);
  serviceMock("profileList").mockResolvedValue([]);
  serviceMock("profileActive").mockResolvedValue("");
  serviceMock("coreInstalled").mockResolvedValue([]);
  serviceMock("coreListVersions").mockResolvedValue([]);
  serviceMock("coreCurrent").mockResolvedValue(null);
}

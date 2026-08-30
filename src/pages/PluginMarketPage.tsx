import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { PluginHost } from "@/plugins/PluginHost";
import { usePluginStore } from "@/stores/pluginStore";
import { useOnMount } from "@/hooks/useTauriCommand";
import {
  marketInstall,
  marketOfficial,
  marketSearch,
  marketUpgrades,
  openSecondaryWindow,
  pluginReadme,
  presetsGet,
} from "@/services/tauriService";
import { toast } from "@/stores/toastStore";
import type { MarketPlugin, MarketRepo, PresetPlugin } from "@/types/plugin";
import type { IconName } from "@/components/Icon";

/**
 * 插件市场：三个标签页
 * - 官方插件：dsh-tauri-desk/dsh-tauri-plugins 注册表（远程优先，离线回退内置快照），支持安装与升级
 * - 预设：随应用分发的预设卡片（映射到内置插件）
 * - 社区：GitHub 仓库搜索（按 star 排序），zipball 下载 → 定位 manifest → 安装
 */

type Tab = "official" | "presets" | "community";

export default function PluginMarketPage(): React.ReactElement {
  const plugins = usePluginStore((s) => s.plugins);
  const refresh = usePluginStore((s) => s.refresh);
  const [tab, setTab] = useState<Tab>("official");
  const [registry, setRegistry] = useState<MarketPlugin[]>([]);
  const [registryUpdated, setRegistryUpdated] = useState<string>("");
  const [upgrades, setUpgrades] = useState<MarketPlugin[]>([]);
  const [presets, setPresets] = useState<PresetPlugin[]>([]);
  const [query, setQuery] = useState<string>("");
  const [repos, setRepos] = useState<MarketRepo[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);
  const [installing, setInstalling] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [readme, setReadme] = useState<string>("");

  useOnMount(() => {
    void refresh();
    void presetsGet()
      .then((file) => setPresets(file.presets))
      .catch((err: unknown) => toast.error(String(err)));
    void marketOfficial()
      .then((reg) => {
        setRegistry(reg.plugins);
        setRegistryUpdated(reg.updatedAt);
      })
      .catch((err: unknown) => toast.error(String(err)));
    void reloadUpgrades();
  });

  const reloadUpgrades = async (): Promise<void> => {
    try {
      setUpgrades(await marketUpgrades());
    } catch {
      // 升级检测失败不阻塞市场浏览
      setUpgrades([]);
    }
  };

  const runInstall = async (key: string, repo: string, subpath?: string, label?: string): Promise<void> => {
    setInstalling((list) => [...list, key]);
    try {
      const info = await marketInstall(repo, subpath);
      toast.success(`${label ?? info.manifest.name} v${info.manifest.version} 安装成功`);
      await refresh();
      await reloadUpgrades();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setInstalling((list) => list.filter((id) => id !== key));
    }
  };

  const search = async (): Promise<void> => {
    if (query.trim() === "") return;
    setSearching(true);
    try {
      setRepos(await marketSearch(query));
      setSearched(true);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSearching(false);
    }
  };

  const showDetail = async (pluginId: string): Promise<void> => {
    setDetailId(pluginId);
    try {
      setReadme(await pluginReadme(pluginId));
    } catch {
      setReadme(`# ${pluginId}\n\n暂无 README。`);
    }
  };

  const registryState = useMemo(
    () =>
      new Map(
        plugins.map((p) => [p.manifest.id, p]),
      ),
    [plugins],
  );

  if (detailId !== null) {
    const plugin = plugins.find((p) => p.manifest.id === detailId);
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Button variant="ghost" size="sm" onClick={() => setDetailId(null)}>
            ← 返回市场
          </Button>
          <h1 className="mb-3 mt-2 text-lg font-semibold">
            {plugin?.manifest.name ?? detailId}
          </h1>
          {plugin !== undefined && (
            <div className="mb-4 flex gap-2">
              <Badge variant="muted">v{plugin.manifest.version}</Badge>
              <Badge variant={plugin.enabled ? "success" : "muted"}>
                {plugin.enabled ? "已启用" : "已禁用"}
              </Badge>
              {plugin.builtin && <Badge>内置</Badge>}
              <div className="flex gap-1">
                {plugin.manifest.permissions.map((perm) => (
                  <Badge key={perm} variant="warn">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-md border p-4">
            <Markdown content={readme} />
          </div>
          {plugin !== undefined && plugin.enabled && (
            <div className="mt-4 h-80 rounded-md border">
              <PluginHost plugin={plugin} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-lg font-semibold">插件市场</h1>
        <p className="mb-3 text-sm text-muted-foreground">
          官方注册表、预设与 GitHub 社区插件的一键安装 / 升级
        </p>
        <Tabs
          items={[
            { id: "official", label: "官方插件" },
            { id: "presets", label: "预设" },
            { id: "community", label: "社区搜索" },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
        />

        {tab === "official" && (
          <div className="mt-4">
            <p className="mb-3 text-xs text-muted-foreground">
              数据源：dsh-tauri-desk/dsh-tauri-plugins{registryUpdated && `（快照 ${registryUpdated}，远程可达时自动更新）`}
            </p>
            <div className="grid gap-3">
              {registry.map((entry) => {
                const installed = registryState.get(entry.id);
                const upgradeFor = upgrades.find((u) => u.id === entry.id);
                const busy = installing.includes(entry.id);
                return (
                  <Card key={entry.id}>
                    <CardContent className="flex items-start gap-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon name="puzzle" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{entry.name}</span>
                          <Badge variant="muted">v{entry.version}</Badge>
                          {entry.official && <Badge>官方</Badge>}
                          {installed !== undefined && upgradeFor === undefined && (
                            <Badge variant="success">
                              已安装 v{installed.manifest.version}
                            </Badge>
                          )}
                          {upgradeFor !== undefined && (
                            <Badge variant="warn">可升级 → v{entry.version}</Badge>
                          )}
                          {entry.tags.map((t) => (
                            <Badge key={t} variant="muted">
                              {t}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{entry.description}</p>
                        <div className="mt-2 flex gap-2">
                          {upgradeFor !== undefined && (
                            <Button size="sm" disabled={busy} onClick={() => void runInstall(entry.id, entry.repo, entry.path, entry.name)}>
                              {busy ? "升级中…" : `升级到 v${entry.version}`}
                            </Button>
                          )}
                          {installed === undefined && (
                            <Button size="sm" disabled={busy} onClick={() => void runInstall(entry.id, entry.repo, entry.path, entry.name)}>
                              {busy ? "安装中…" : "安装"}
                            </Button>
                          )}
                          {installed !== undefined && (
                            <Button variant="outline" size="sm" onClick={() => void showDetail(entry.id)}>
                              详情
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void openSecondaryWindow(
                                `market-${entry.id}`,
                                `${entry.name} 源码`,
                                `https://github.com/${entry.repo}/tree/main/${entry.path}`,
                              ).catch(() => undefined)
                            }
                          >
                            源码
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {registry.length === 0 && (
                <p className="text-sm text-muted-foreground">注册表加载中…</p>
              )}
            </div>
          </div>
        )}

        {tab === "presets" && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {presets.map((preset) => {
              const targetId = preset.pluginId;
              const installed = targetId !== null && registryState.has(targetId);
              return (
                <Card key={preset.id}>
                  <CardContent className="flex items-start gap-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon name={preset.icon as IconName} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{preset.name}</span>
                        {preset.recommended && <Badge>推荐</Badge>}
                        {installed && <Badge variant="success">已内置</Badge>}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
                      <div className="mt-2 flex gap-2">
                        {installed && targetId !== null && (
                          <Button variant="outline" size="sm" onClick={() => void showDetail(targetId)}>
                            详情
                          </Button>
                        )}
                        {preset.id === "dsh-market" && (
                          <Button size="sm" onClick={() => setTab("official")}>
                            打开官方插件列表
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {tab === "community" && (
          <div className="mt-4">
            <div className="flex gap-2">
              <Input
                className="flex-1"
                placeholder="搜索 GitHub 上的 dsh 插件仓库，如 worktree / session"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search();
                }}
              />
              <Button onClick={() => void search()} disabled={searching}>
                {searching ? "搜索中…" : "搜索"}
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {repos.map((repo) => {
                const busy = installing.includes(repo.fullName);
                return (
                  <Card key={repo.fullName}>
                    <CardContent className="flex items-start gap-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon name="git" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={repo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium hover:underline"
                          >
                            {repo.fullName}
                          </a>
                          <Badge variant="muted">★ {repo.stars}</Badge>
                        </div>
                        {repo.description !== null && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{repo.description}</p>
                        )}
                        <div className="mt-2">
                          <Button size="sm" disabled={busy} onClick={() => void runInstall(repo.fullName, repo.fullName)}>
                            {busy ? "安装中…" : "安装（下载 zipball 并定位 manifest）"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {searched && repos.length === 0 && (
                <p className="text-sm text-muted-foreground">没有匹配的仓库。</p>
              )}
              {!searched && (
                <p className="text-sm text-muted-foreground">
                  输入关键词搜索 GitHub 上的 dsh 插件；安装时会自动在仓库中定位 manifest.json。
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

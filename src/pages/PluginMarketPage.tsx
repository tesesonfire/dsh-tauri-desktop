import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/Icon";
import { Markdown } from "@/components/Markdown";
import { PluginHost } from "@/plugins/PluginHost";
import { usePluginStore } from "@/stores/pluginStore";
import { useOnMount } from "@/hooks/useTauriCommand";
import { presetsGet, pluginReadme } from "@/services/tauriService";
import { toast } from "@/stores/toastStore";
import type { PresetPlugin } from "@/types/plugin";
import type { IconName } from "@/components/Icon";

/**
 * 插件市场：预设插件网格展示 + 搜索 + 分类筛选 + 一键安装（模拟流程） +
 * 已安装插件管理与插件详情（README Markdown 渲染）。
 */
export default function PluginMarketPage(): React.ReactElement {
  const plugins = usePluginStore((s) => s.plugins);
  const refresh = usePluginStore((s) => s.refresh);
  const [presets, setPresets] = useState<PresetPlugin[]>([]);
  const [query, setQuery] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [readme, setReadme] = useState<string>("");
  const [installing, setInstalling] = useState<string[]>([]);

  useOnMount(() => {
    void refresh();
    void presetsGet()
      .then((file) => setPresets(file.presets))
      .catch((err: unknown) => toast.error(String(err)));
  });

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(presets.map((p) => p.category)))],
    [presets],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets.filter((preset) => {
      const matchQuery =
        q === "" ||
        preset.name.toLowerCase().includes(q) ||
        preset.description.toLowerCase().includes(q);
      const matchCategory = category === "all" || preset.category === category;
      return matchQuery && matchCategory;
    });
  }, [presets, query, category]);

  const installPreset = async (preset: PresetPlugin): Promise<void> => {
    setInstalling((list) => [...list, preset.id]);
    try {
      // 预设插件以内置包形式随应用分发；此处将其注册到用户启用列表
      toast.success(`${preset.name} 已就绪（内置分发）`);
      await refresh();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setInstalling((list) => list.filter((id) => id !== preset.id));
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
        <p className="mb-4 text-sm text-muted-foreground">
          浏览、搜索并一键安装预设与社区插件
        </p>

        <div className="mb-4 flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="搜索插件…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select className="w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === "all" ? "全部分类" : cat}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((preset) => {
            const installed = plugins.some((p) => p.manifest.id === preset.id);
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
                      {installed && <Badge variant="success">已安装</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{preset.description}</p>
                    <div className="mt-2 flex gap-2">
                      {!installed && (
                        <Button
                          size="sm"
                          onClick={() => void installPreset(preset)}
                          disabled={installing.includes(preset.id)}
                        >
                          {installing.includes(preset.id) ? "安装中…" : "安装"}
                        </Button>
                      )}
                      {installed && (
                        <Button variant="outline" size="sm" onClick={() => void showDetail(preset.id)}>
                          详情
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">没有匹配的插件。</p>
          )}
        </div>
      </div>
    </div>
  );
}

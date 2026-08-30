import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Card, CardContent } from "@/components/ui/Card";
import { usePluginSystem } from "@/hooks/usePluginSystem";
import { usePluginStore } from "@/stores/pluginStore";
import { useOnMount } from "@/hooks/useTauriCommand";

/** 已安装插件列表（设置页内嵌）：启用开关 + 卸载 + 错误详情 */
export function PluginList(): React.ReactElement {
  const plugins = usePluginStore((s) => s.plugins);
  const loading = usePluginStore((s) => s.loading);
  const { refresh, enable, uninstall } = usePluginSystem();

  useOnMount(() => {
    void refresh();
  });

  if (loading && plugins.length === 0) {
    return <p className="text-sm text-muted-foreground">加载插件…</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">
          尚未安装任何插件。前往插件市场安装，或将插件目录放入 ~/.dsh/plugins。
        </p>
      )}
      {plugins.map((plugin) => (
        <Card key={plugin.manifest.id}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{plugin.manifest.name}</span>
                <Badge variant="muted">v{plugin.manifest.version}</Badge>
                {plugin.builtin && <Badge>内置</Badge>}
                {plugin.error !== null && <Badge variant="destructive">错误</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {plugin.manifest.description || plugin.manifest.id}
              </p>
              {plugin.error !== null && (
                <p className="mt-1 rounded bg-destructive/10 p-1.5 font-mono text-xs text-destructive">
                  {plugin.error}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Switch
                checked={plugin.enabled}
                onChange={(checked) => void enable(plugin.manifest.id, checked)}
              />
              {!plugin.builtin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => void uninstall(plugin.manifest.id)}
                >
                  卸载
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

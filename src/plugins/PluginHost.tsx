import { useEffect, useMemo, useRef, useState } from "react";
import { pluginAssetUrl } from "@/services/pluginApi";
import type { PluginInfo } from "@/types/plugin";

export interface PluginHostProps {
  plugin: PluginInfo;
  /** 面板高度撑满父容器 */
  className?: string;
}

/**
 * 插件 iframe 宿主：
 * - 通过 dshplugin:// 自定义协议加载插件入口（Rust 端安全 serve）
 * - 标记 data-plugin-frame 供 PluginBridge 广播
 * - 展示加载失败/插件错误状态
 */
export function PluginHost(props: PluginHostProps): React.ReactElement {
  const { plugin } = props;
  const [loadError, setLoadError] = useState<boolean>(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = useMemo(
    () => pluginAssetUrl(plugin.manifest.id, plugin.manifest.entry),
    [plugin.manifest.id, plugin.manifest.entry],
  );

  useEffect(() => {
    setLoadError(false);
  }, [src]);

  if (!plugin.enabled || plugin.error !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium text-destructive">插件不可用</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {plugin.error ?? "插件已被禁用"}
        </p>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${props.className ?? ""}`}>
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">插件界面加载失败</p>
          <button
            type="button"
            className="text-xs text-primary underline"
            onClick={() => {
              setLoadError(false);
              if (iframeRef.current !== null) {
                iframeRef.current.src = src;
              }
            }}
          >
            重试
          </button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        data-plugin-frame={plugin.manifest.id}
        title={plugin.manifest.name}
        src={src}
        sandbox="allow-scripts allow-forms allow-popups"
        onError={() => setLoadError(true)}
        className="h-full w-full border-0 bg-transparent"
      />
    </div>
  );
}

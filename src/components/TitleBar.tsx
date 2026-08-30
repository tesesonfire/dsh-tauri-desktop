import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 平台检测：macOS 交通灯在左（留出拖拽区），Windows/Linux 控制按钮在右 */
function isMacPlatform(): boolean {
  return navigator.userAgent.includes("Mac");
}

/**
 * 自定义标题栏。
 * - 整条标题栏为拖拽区（data-tauri-drag-region）
 * - macOS：左侧留出交通灯空间；Windows/Linux：右侧最小化/最大化/关闭按钮
 */
export default function TitleBar(): React.ReactElement {
  const [isMac] = useState<boolean>(isMacPlatform());
  const [maximized, setMaximized] = useState<boolean>(false);
  const currentWindow = getCurrentWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    currentWindow
      .isMaximized()
      .then(setMaximized)
      .catch((err: unknown) => console.error(err));
    currentWindow
      .onResized(async () => {
        setMaximized(await currentWindow.isMaximized());
      })
      .then((fn: () => void) => {
        unlisten = fn;
      })
      .catch((err: unknown) => console.error(err));
    return () => {
      unlisten?.();
    };
  }, [currentWindow]);

  const minimize = (): void => {
    void currentWindow.minimize();
  };
  const toggleMaximize = (): void => {
    void currentWindow.toggleMaximize();
  };
  const close = (): void => {
    void currentWindow.close();
  };

  if (isMac) {
    return (
      <header
        data-tauri-drag-region
        className="drag-region flex h-10 shrink-0 items-center bg-sidebar pl-[78px]"
      >
        <span data-tauri-drag-region className="text-sm font-semibold">
          dsh-tauri-desktop
        </span>
      </header>
    );
  }

  return (
    <header
      data-tauri-drag-region
      className="drag-region flex h-10 shrink-0 select-none items-center justify-between bg-sidebar"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 pl-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
          dS
        </div>
        <span data-tauri-drag-region className="text-sm font-semibold">
          dsh-tauri-desktop
        </span>
      </div>
      <div className="no-drag-region flex h-full">
        <TitleBarButton label="─" title="最小化" onClick={minimize} />
        <TitleBarButton
          label={maximized ? "❐" : "□"}
          title={maximized ? "还原" : "最大化"}
          onClick={toggleMaximize}
        />
        <TitleBarButton
          label="✕"
          title="关闭"
          onClick={close}
          danger={true}
        />
      </div>
    </header>
  );
}

interface TitleBarButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  danger?: boolean;
}

function TitleBarButton(props: TitleBarButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className={`flex h-full w-12 items-center justify-center text-sm transition-colors ${
        props.danger
          ? "hover:bg-destructive hover:text-destructive-foreground"
          : "hover:bg-accent"
      }`}
    >
      {props.label}
    </button>
  );
}

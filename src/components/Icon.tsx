/**
 * 内置轻量图标集（lucide 风格 SVG，stroke=currentColor）。
 * 插件 contributes.sidebar.icon 通过名称引用。
 */

export type IconName =
  | "files"
  | "search"
  | "puzzle"
  | "settings"
  | "bell"
  | "terminal"
  | "panel"
  | "store"
  | "refresh"
  | "trash"
  | "plus"
  | "x"
  | "check"
  | "alert"
  | "folder"
  | "git"
  | "play"
  | "stop"
  | "info"
  | "download"
  | "archive"
  | "menu";

const PATHS: Record<IconName, React.ReactNode> = {
  files: <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v5h6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  puzzle: <path d="M4 7h3a2 2 0 1 1 4 0h3v4a2 2 0 1 0 0 4v4h-4a2 2 0 1 1-4 0H4v-4a2 2 0 1 0 0-4z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17m10-10 2.1-2.1" />
    </>
  ),
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9m4.3 13a2 2 0 0 0 3.4 0" />,
  terminal: <path d="m4 17 6-6-6-6m8 14h8" />,
  panel: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
    </>
  ),
  store: <path d="M3 9 5 3h14l2 6M3 9h18v12H3zM9 21v-6h6v6" />,
  refresh: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />,
  trash: <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 11v6m4-6v6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m4 12 6 6L20 6" />,
  alert: (
    <>
      <path d="M12 3 2 21h20zM12 10v5m0 3v.01" />
    </>
  ),
  folder: <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v3M3 7l2 13h14l2-13" />,
  git: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M6 9v6m3-9h3a3 3 0 0 1 3 3m0 3a3 3 0 0 1-3 3H9" />
    </>
  ),
  play: <path d="M6 4l14 8-14 8z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5m0-8v.01" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" />,
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

/** 判断字符串是否为内置图标名（插件 contributes.icon 用） */
export function isIconName(name: string): name is IconName {
  return name in PATHS;
}

export function Icon(props: IconProps): React.ReactElement {
  return (
    <svg
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      {PATHS[props.name]}
    </svg>
  );
}

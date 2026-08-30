import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/Badge";
import { Tabs, useTabs } from "@/components/ui/Tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PluginList } from "@/components/PluginList";
import { UpdatePanel } from "@/components/UpdatePanel";
import { CliPanel } from "@/components/CliPanel";
import { CoreManagerPanel } from "@/components/CoreManagerPanel";
import { useTheme } from "@/hooks/useTheme";
import { useProfileStore } from "@/stores/profileStore";
import { toast } from "@/stores/toastStore";
import {
  appVersion,
  settingsGet,
  settingsSave,
} from "@/services/tauriService";
import type { AppSettings, ThemeMode } from "@/types/tauri";

const TABS = [
  { id: "general", label: "通用" },
  { id: "plugins", label: "插件" },
  { id: "dsh", label: "dsh 配置" },
  { id: "advanced", label: "高级" },
];

/** 设置页：通用 / 插件 / dsh 配置 / 高级 四个标签页 */
export default function SettingsPage(): React.ReactElement {
  const { active, setActive } = useTabs("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    void settingsGet()
      .then(setSettings)
      .catch((err: unknown) => toast.error(String(err)));
    void appVersion().then(setVersion).catch(() => setVersion("?"));
  }, []);

  const save = async (next: AppSettings): Promise<void> => {
    setSettings(next);
    try {
      await settingsSave(next);
      toast.success("设置已保存");
    } catch (err) {
      toast.error(String(err));
    }
  };

  if (settings === null) {
    return <div className="p-6 text-sm text-muted-foreground">加载设置…</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-lg font-semibold">设置</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          dsh-tauri-desktop v{version}
        </p>
        <Tabs items={TABS} active={active} onChange={setActive} className="mb-5" />

        {active === "general" && (
          <GeneralTab settings={settings} onChange={save} />
        )}
        {active === "plugins" && <PluginList />}
        {active === "dsh" && <DshTab settings={settings} onChange={save} />}
        {active === "advanced" && <AdvancedTab settings={settings} onChange={save} />}
      </div>
    </div>
  );
}

function GeneralTab(props: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void | Promise<void>;
}): React.ReactElement {
  const { mode, resolved, setMode } = useTheme();
  const settings = props.settings;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label="主题" hint={`当前生效：${resolved === "dark" ? "深色" : "浅色"}`}>
            <Select
              className="w-40"
              value={mode}
              onChange={(e) => {
                const next = e.target.value as ThemeMode;
                setMode(next);
                void props.onChange({
                  ...settings,
                  general: { ...settings.general, theme: next },
                });
              }}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </Select>
          </Row>
          <Row label="语言">
            <Select
              className="w-40"
              value={settings.general.language}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  general: { ...settings.general, language: e.target.value },
                })
              }
            >
              <option value="zh-CN">简体中文</option>
              <option value="en-US">English</option>
            </Select>
          </Row>
          <Row label="启动时窗口">
            <Select
              className="w-40"
              value={settings.general.launchBehavior}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  general: {
                    ...settings.general,
                    launchBehavior: e.target.value as AppSettings["general"]["launchBehavior"],
                  },
                })
              }
            >
              <option value="normal">正常大小</option>
              <option value="maximized">最大化</option>
              <option value="minimized">最小化到托盘</option>
            </Select>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

function DshTab(props: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void | Promise<void>;
}): React.ReactElement {
  const settings = props.settings;
  const profiles = useProfileStore((s) => s.profiles);
  const refreshProfiles = useProfileStore((s) => s.refresh);
  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>dsh 核心</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label="Node 路径" hint="留空使用 PATH 中的 node">
            <Input
              className="w-72"
              value={settings.dsh.nodePath}
              placeholder="C:\\Program Files\\nodejs\\node.exe"
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  dsh: { ...settings.dsh, nodePath: e.target.value },
                })
              }
            />
          </Row>
          <Row label="端口">
            <Input
              className="w-40"
              type="number"
              value={settings.dsh.port}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  dsh: { ...settings.dsh, port: Number(e.target.value) || 3080 },
                })
              }
            />
          </Row>
          <Row label="默认档案">
            <Select
              className="w-40"
              value={settings.dsh.defaultProfile}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  dsh: { ...settings.dsh, defaultProfile: e.target.value },
                })
              }
            >
              <option value="">（无）</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="随应用自动启动 dsh">
            <Switch
              checked={settings.dsh.autoStart}
              onChange={(checked) =>
                void props.onChange({
                  ...settings,
                  dsh: { ...settings.dsh, autoStart: checked },
                })
              }
            />
          </Row>
        </CardContent>
      </Card>
      <CoreManagerPanel />
      <CliPanel />
    </div>
  );
}

function AdvancedTab(props: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void | Promise<void>;
}): React.ReactElement {
  const settings = props.settings;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>开发者</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Row label="开发者模式" hint="显示更多调试信息与实验功能">
            <Switch
              checked={settings.advanced.devMode}
              onChange={(checked) =>
                void props.onChange({
                  ...settings,
                  advanced: { ...settings.advanced, devMode: checked },
                })
              }
            />
          </Row>
          <Row label="日志级别">
            <Select
              className="w-40"
              value={settings.advanced.logLevel}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  advanced: {
                    ...settings.advanced,
                    logLevel: e.target.value as AppSettings["advanced"]["logLevel"],
                  },
                })
              }
            >
              <option value="trace">trace</option>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </Select>
          </Row>
          <Row label="HTTP 代理" hint="插件网络请求与更新检查使用">
            <Input
              className="w-72"
              placeholder="http://127.0.0.1:7890"
              value={settings.advanced.proxy}
              onChange={(e) =>
                void props.onChange({
                  ...settings,
                  advanced: { ...settings.advanced, proxy: e.target.value },
                })
              }
            />
          </Row>
          <Row label="实验性功能">
            <Switch
              checked={settings.advanced.experimental}
              onChange={(checked) =>
                void props.onChange({
                  ...settings,
                  advanced: { ...settings.advanced, experimental: checked },
                })
              }
            />
          </Row>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>插件安全白名单</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <TagEditor
            label="可执行命令（exec）"
            tags={settings.advanced.execAllowlist}
            onChange={(tags) =>
              void props.onChange({
                ...settings,
                advanced: { ...settings.advanced, execAllowlist: tags },
              })
            }
          />
          <TagEditor
            label="文件系统白名单目录（fs），~ 表示用户目录"
            tags={settings.advanced.fsAllowlist}
            placeholder="D:\projects"
            onChange={(tags) =>
              void props.onChange({
                ...settings,
                advanced: { ...settings.advanced, fsAllowlist: tags },
              })
            }
          />
        </CardContent>
      </Card>
      <UpdatePanel />
    </div>
  );
}

function Row(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{props.label}</p>
        {props.hint && <p className="text-xs text-muted-foreground">{props.hint}</p>}
      </div>
      {props.children}
    </div>
  );
}

function TagEditor(props: {
  label: string;
  tags: string[];
  placeholder?: string;
  onChange: (tags: string[]) => void;
}): React.ReactElement {
  const [value, setValue] = useState<string>("");
  const add = (): void => {
    const trimmed = value.trim();
    if (trimmed && !props.tags.includes(trimmed)) {
      props.onChange([...props.tags, trimmed]);
    }
    setValue("");
  };
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{props.label}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {props.tags.map((tag) => (
          <Badge key={tag} variant="muted">
            {tag}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-destructive"
              onClick={() => props.onChange(props.tags.filter((t) => t !== tag))}
              aria-label={`移除 ${tag}`}
            >
              ×
            </button>
          </Badge>
        ))}
        {props.tags.length === 0 && (
          <span className="text-xs text-muted-foreground">（空 = 使用默认）</span>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          className="w-64"
          value={value}
          placeholder={props.placeholder ?? "输入后回车添加"}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        <Button variant="outline" size="sm" onClick={add}>
          添加
        </Button>
      </div>
    </div>
  );
}
